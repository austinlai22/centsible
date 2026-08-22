/**
 * db/migrate.js — Run once to create the schema.
 *
 * Usage:  npm run db:migrate
 *
 * Tables:
 *   users            — app accounts (email + hashed password)
 *   refresh_tokens   — JWT refresh token rotation ledger
 *   plaid_items      — one row per linked bank (access token encrypted at rest)
 *   transactions     — cached transaction data pulled from Plaid
 *
 * Design decisions:
 *   - UUIDs for all primary keys — harder to enumerate than integers
 *   - plaid_access_token stored as ciphertext (encrypted by lib/crypto.js)
 *     so a raw DB dump never exposes live bank tokens
 *   - Indexes on every foreign key and every column used in WHERE clauses
 *   - ON DELETE CASCADE so removing a user cleans up all related rows
 */

import "dotenv/config";
import { pool } from "./client.js";

const SCHEMA = `
-- ── Enable UUID generation ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  name            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── users: onboarding columns ────────────────────────────────────────────────
-- Added via ALTER rather than the CREATE TABLE above so this migration stays
-- safe to re-run against a database that was created before this change.
-- onboarded_at is the single source of truth for "has this user completed
-- onboarding" — the frontend checks this instead of any local state.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at    TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS income          NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS financial_goal  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS housing_cost    NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS spending_style  TEXT;

-- ── refresh_tokens ────────────────────────────────────────────────────────────
-- Stores hashed refresh tokens for rotation.
-- A token is invalidated by deleting its row (logout) or replacing it (rotation).
-- family_id groups a chain of rotated tokens — if an old token is reused,
-- the entire family is revoked (detects token theft).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,  -- bcrypt hash of the raw token
  family_id   UUID        NOT NULL,         -- rotation family for reuse detection
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id  ON refresh_tokens(family_id);

-- ── plaid_items ───────────────────────────────────────────────────────────────
-- One row per linked bank ("Item" in Plaid terminology).
-- access_token_enc: AES-256-GCM encrypted — decrypted only in server memory,
--                   never sent to the client.
-- cursor:           Plaid transaction sync cursor for incremental fetching.
CREATE TABLE IF NOT EXISTS plaid_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_item_id       TEXT        NOT NULL UNIQUE,  -- Plaid's own item identifier
  plaid_institution_id TEXT,
  institution_name    TEXT,
  access_token_enc    TEXT        NOT NULL,          -- encrypted ciphertext
  cursor              TEXT,                          -- transaction sync cursor
  status              TEXT        NOT NULL DEFAULT 'good',  -- good | error | relink_required
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);

-- ── accounts ──────────────────────────────────────────────────────────────────
-- Cached account metadata (balances, names) from Plaid.
-- Refreshed on each sync; not the source of truth — Plaid is.
CREATE TABLE IF NOT EXISTS accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id   UUID        NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_account_id TEXT       NOT NULL UNIQUE,
  name            TEXT        NOT NULL,
  official_name   TEXT,
  type            TEXT,        -- depository, credit, investment, loan
  subtype         TEXT,        -- checking, savings, credit card, etc.
  mask            TEXT,        -- last 4 digits
  balance_current NUMERIC(12,2),
  balance_available NUMERIC(12,2),
  currency_code   TEXT        DEFAULT 'USD',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id       ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_plaid_item_id ON accounts(plaid_item_id);

-- ── transactions ──────────────────────────────────────────────────────────────
-- Cached transactions synced from Plaid.
-- plaid_transaction_id is the stable Plaid ID (used for upserts).
CREATE TABLE IF NOT EXISTS transactions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_account_id        TEXT        NOT NULL,
  plaid_transaction_id    TEXT        NOT NULL UNIQUE,
  amount                  NUMERIC(12,2) NOT NULL,  -- positive = debit, negative = credit
  currency_code           TEXT        DEFAULT 'USD',
  description             TEXT,
  merchant_name           TEXT,
  category                TEXT,        -- our normalised category label
  plaid_category          TEXT[],      -- raw Plaid category array
  date                    DATE        NOT NULL,
  pending                 BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(date DESC);

-- ── transactions: manual entry support ───────────────────────────────────────
-- The table was originally built Plaid-only, with plaid_transaction_id as
-- NOT NULL UNIQUE. Manual transactions (entered by the user, not synced from
-- a bank) have no Plaid ID, so that constraint has to be relaxed.
--
-- source distinguishes the two kinds of rows:
--   'plaid'  — written only by lib/sync.js during a Plaid sync; never
--              editable or deletable via the manual transaction endpoints
--   'manual' — written only by the manual CRUD endpoints in routes/data.js;
--              plaid_transaction_id is always NULL for these rows
--
-- This separation matters for correctness: if a manual row could collide
-- with a future Plaid-synced row, sync would silently overwrite user data.
ALTER TABLE transactions ALTER COLUMN plaid_transaction_id DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN plaid_account_id     DROP NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plaid';

-- A partial unique index (rather than a table-level UNIQUE constraint) so
-- multiple manual rows — which all have plaid_transaction_id = NULL — don't
-- collide. Only non-null Plaid IDs are required to be unique.
--
-- The original CREATE TABLE above defines plaid_transaction_id as a column-
-- level UNIQUE constraint, which Postgres names transactions_plaid_transaction_id_key
-- and implements as a full UNIQUE CONSTRAINT (not a bare index) — so it must
-- be removed with DROP CONSTRAINT, not DROP INDEX. Attempting DROP INDEX on
-- a constraint-backed index fails with "cannot drop index ... because
-- constraint ... requires it", since the index has an owner constraint that
-- must be dropped first (or dropped together via DROP CONSTRAINT, as below).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_plaid_transaction_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_plaid_id_unique
  ON transactions (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(user_id, source);

-- ── user_budgets ──────────────────────────────────────────────────────────────
-- Monthly budget amounts per category, per user.
-- month is stored as the first day of that month: 2025-05-01.
CREATE TABLE IF NOT EXISTS user_budgets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  month       DATE        NOT NULL,  -- e.g. 2025-05-01
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category, month)
);

-- ── user_budgets: period column ───────────────────────────────────────────────
-- routes/data.js stores each category under exactly one period:
--   'monthly'  → month holds the first day of a calendar month (2025-05-01)
--   'semester' → month holds the semester's start date       (2025-08-15)
-- Without this column every GET/PUT /api/budgets fails with a
-- 'column "period" does not exist' error, which the frontend silently
-- swallows by falling back to DEMO_BUDGETS — budgets appear to work in the
-- UI but never actually persist.
ALTER TABLE user_budgets ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'monthly';

-- The original UNIQUE (user_id, category, month) predates the period split.
-- It has to widen to include period, otherwise a category could never hold
-- both a monthly rate and a semester total on the same date. Postgres names
-- the inline constraint user_budgets_user_id_category_month_key.
ALTER TABLE user_budgets DROP CONSTRAINT IF EXISTS user_budgets_user_id_category_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_budgets_unique
  ON user_budgets (user_id, category, month, period);

CREATE INDEX IF NOT EXISTS idx_user_budgets_user_id ON user_budgets(user_id, month);

-- ── user_goals ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_goals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  emoji       TEXT        DEFAULT '🎯',
  target      NUMERIC(12,2) NOT NULL,
  saved       NUMERIC(12,2) NOT NULL DEFAULT 0,
  deadline    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);

-- ── rewards ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  points      INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── reward_redemptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  charity_id  INTEGER     NOT NULL,
  charity_name TEXT       NOT NULL,
  points_spent INTEGER    NOT NULL,
  usd_value   NUMERIC(8,2) NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON reward_redemptions(user_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
-- Automatically maintains updated_at on any table that has it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','plaid_items','accounts','transactions',
    'user_budgets','user_goals','rewards'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;
       CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t
    );
  END LOOP;
END;
$$;
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("[migrate] Running schema migration…");
    await client.query(SCHEMA);
    console.log("[migrate] ✓ Schema up to date.");
  } catch (err) {
    console.error("[migrate] ✗ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
