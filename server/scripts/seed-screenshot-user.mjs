/**
 * Creates (or resets) a stable account used for visual-review screenshots:
 * already onboarded, with real transactions copied from an existing account so
 * every screen has representative content rather than empty states.
 *
 *   node scripts/seed-screenshot-user.mjs [sourceEmail]
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { query, pool } from "../db/client.js";

const EMAIL = "screenshots@centsible.local";
const PASSWORD = "testpassword123";
// No default: the source account is whoever is running this, and baking a
// real address into a public repo is both a privacy leak and useless to
// anyone else who clones it.
const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("Usage: node scripts/seed-screenshot-user.mjs <sourceEmail>\n  Copies an existing account's transactions into a stable screenshot account.");
  process.exit(1);
}

await query("DELETE FROM users WHERE email = $1", [EMAIL]);

const hash = await bcrypt.hash(PASSWORD, 12);
const { rows: [u] } = await query(
  `INSERT INTO users (email, password_hash, name, onboarded_at, income, financial_goal, housing_cost, spending_style)
   VALUES ($1,$2,'Austin',NOW(),4500,'Build an emergency fund',1500,'Balanced') RETURNING id`,
  [EMAIL, hash]
);
// $1 (uuid) and the email column (text) must be separate params — reusing one
// placeholder for both makes Postgres fail type deduction.
await query(
  "INSERT INTO auth_identities (user_id, provider, provider_uid, email) VALUES ($1,'password',$2,$3)",
  [u.id, u.id, EMAIL]
);
await query("INSERT INTO rewards (user_id, points) VALUES ($1, 340)", [u.id]);

const { rows: [src] } = await query("SELECT id FROM users WHERE email = $1", [SOURCE]);
let copied = 0;
if (src) {
  const r = await query(
    `INSERT INTO transactions (user_id, amount, description, merchant_name, category, date, source, pending)
     SELECT $1, amount, description, merchant_name, category, date, 'manual', pending
     FROM transactions WHERE user_id = $2 ORDER BY date DESC LIMIT 120`,
    [u.id, src.id]
  );
  copied = r.rowCount;
}

await query(
  `INSERT INTO user_goals (user_id, name, emoji, target, saved, deadline) VALUES
     ($1,'Japan trip','✈️',4000,1200,'2027-03-01'),
     ($1,'Emergency fund','🏦',10000,3500,NULL),
     ($1,'New laptop','💻',1800,650,'2026-12-01')`,
  [u.id]
);

const month = new Date();
const monthStr = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}-01`;
for (const [cat, amt] of Object.entries({ Housing:1500, Food:600, Transport:200, Shopping:300, Entertainment:150, Health:100 })) {
  await query(
    `INSERT INTO user_budgets (user_id, category, amount, month, period) VALUES ($1,$2,$3,$4,'monthly')
     ON CONFLICT (user_id, category, month, period) DO UPDATE SET amount = EXCLUDED.amount`,
    [u.id, cat, amt, monthStr]
  );
}

console.log(`screenshot user ready: ${EMAIL} / ${PASSWORD}`);
console.log(`  transactions copied from ${SOURCE}: ${copied}`);
await pool.end();
