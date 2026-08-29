/**
 * db/seed.js — Optional local development seed data
 *
 * Creates one test user with a password you set via env var, plus a couple
 * of goals and budget entries, so you can log in and see a populated app
 * immediately instead of an empty account after a fresh `db:migrate`.
 *
 * This is for local development only — never run this against a production
 * database. It is intentionally NOT wired into any deploy step.
 *
 * Usage:
 *   SEED_PASSWORD=testpassword123 npm run db:seed
 *
 * If SEED_PASSWORD isn't set, a random one is generated and printed once —
 * copy it immediately, it is not stored anywhere and cannot be recovered.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool, connectClient } from "./client.js";

const SEED_EMAIL = process.env.SEED_EMAIL || "demo@flowapp.test";
const SEED_PASSWORD = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");

async function seed() {
  const client = await connectClient();
  try {
    console.log("[seed] Checking for existing seed user…");
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [SEED_EMAIL]);
    if (existing.rows.length > 0) {
      console.log(`[seed] User ${SEED_EMAIL} already exists — skipping creation.`);
      console.log("[seed] Done (no changes made).");
      return;
    }

    console.log("[seed] Creating demo user…");
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, name, onboarded_at, income, financial_goal, housing_cost, spending_style)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
       RETURNING id`,
      [SEED_EMAIL, passwordHash, "Demo", 5000, "Build an emergency fund", 1500, "Balanced"]
    );
    const userId = rows[0].id;

    await client.query("INSERT INTO rewards (user_id, points) VALUES ($1, 340)", [userId]);

    await client.query(
      `INSERT INTO user_goals (user_id, name, emoji, target, saved, deadline) VALUES
         ($1, 'Japan trip', '✈️', 4000, 1200, '2026-03-01'),
         ($1, 'Emergency fund', '🏦', 10000, 3500, NULL)`,
      [userId]
    );

    const month = new Date();
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
    const budgets = { Housing: 1500, Food: 600, Transport: 200, Shopping: 300, Entertainment: 150, Health: 100 };
    for (const [category, amount] of Object.entries(budgets)) {
      await client.query(
        `INSERT INTO user_budgets (user_id, category, amount, month) VALUES ($1, $2, $3, $4)`,
        [userId, category, amount, monthStr]
      );
    }

    console.log("[seed] ✓ Demo user created.");
    console.log("");
    console.log("─────────────────────────────────────────");
    console.log(`  Email:    ${SEED_EMAIL}`);
    console.log(`  Password: ${SEED_PASSWORD}`);
    console.log("─────────────────────────────────────────");
    console.log("  Copy this password now — it is not stored anywhere.");
    console.log("");
  } catch (err) {
    console.error("[seed] ✗ Failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
