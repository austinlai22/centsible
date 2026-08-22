/**
 * lib/sync.js — Plaid transaction sync
 *
 * Uses Plaid's /transactions/sync endpoint (cursor-based, incremental).
 * Each call to syncItem() fetches only what's new since the last sync,
 * then upserts added/modified rows and deletes removed ones.
 *
 * Called from:
 *   POST /plaid/exchange-token  — initial sync after linking a bank
 *   POST /plaid/webhook         — SYNC_UPDATES_AVAILABLE event (step 5)
 *   GET  /plaid/transactions    — on-demand refresh if cursor is stale
 *
 * Why cursor-based instead of /transactions/get?
 *   - Incremental: only fetches deltas, not the full history every time
 *   - Handles Plaid's "pending → posted" lifecycle correctly
 *   - Officially recommended by Plaid for production apps
 */

import { plaidClient, normaliseCategory } from "./plaid.js";
import { decrypt, encrypt }               from "./crypto.js";
import { query }                          from "../db/client.js";

/**
 * Syncs transactions for a single Plaid item (linked bank).
 * Fetches all pages until has_more is false, then writes to DB.
 *
 * @param {object} item  — row from plaid_items table
 * @returns {object}     — { added, modified, removed } counts
 */
export async function syncItem(item) {
  const accessToken = decrypt(item.access_token_enc);
  let cursor        = item.cursor || undefined; // undefined = full initial sync

  const added    = [];
  const modified = [];
  const removed  = [];

  // ── Paginate until Plaid says there's nothing more ─────────────────────────
  let hasMore = true;
  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,  // max per page
      options: { include_personal_finance_category: true },
    });

    const data = res.data;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);

    hasMore = data.has_more;
    cursor  = data.next_cursor;
  }

  // ── Write to DB in a transaction ──────────────────────────────────────────
  const client = await (await import("../db/client.js")).pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert added transactions
    for (const txn of added) {
      const category = normaliseCategory(
        txn.personal_finance_category?.primary,
        txn.personal_finance_category?.detailed
      );
      await client.query(
        `INSERT INTO transactions
           (user_id, plaid_account_id, plaid_transaction_id,
            amount, currency_code, description, merchant_name,
            category, plaid_category, date, pending)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (plaid_transaction_id)
           WHERE plaid_transaction_id IS NOT NULL
         DO UPDATE SET
           amount       = EXCLUDED.amount,
           description  = EXCLUDED.description,
           merchant_name= EXCLUDED.merchant_name,
           category     = EXCLUDED.category,
           plaid_category = EXCLUDED.plaid_category,
           date         = EXCLUDED.date,
           pending      = EXCLUDED.pending,
           updated_at   = NOW()`,
        [
          item.user_id,
          txn.account_id,
          txn.transaction_id,
          txn.amount,           // Plaid: positive = debit, negative = credit
          txn.iso_currency_code || "USD",
          txn.name,
          txn.merchant_name || null,
          category,
          txn.category || [],   // legacy category array
          txn.date,
          txn.pending,
        ]
      );
    }

    // Upsert modified transactions (same query — ON CONFLICT handles it)
    for (const txn of modified) {
      const category = normaliseCategory(
        txn.personal_finance_category?.primary,
        txn.personal_finance_category?.detailed
      );
      await client.query(
        `INSERT INTO transactions
           (user_id, plaid_account_id, plaid_transaction_id,
            amount, currency_code, description, merchant_name,
            category, plaid_category, date, pending)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (plaid_transaction_id)
           WHERE plaid_transaction_id IS NOT NULL
         DO UPDATE SET
           amount       = EXCLUDED.amount,
           description  = EXCLUDED.description,
           merchant_name= EXCLUDED.merchant_name,
           category     = EXCLUDED.category,
           plaid_category = EXCLUDED.plaid_category,
           date         = EXCLUDED.date,
           pending      = EXCLUDED.pending,
           updated_at   = NOW()`,
        [
          item.user_id,
          txn.account_id,
          txn.transaction_id,
          txn.amount,
          txn.iso_currency_code || "USD",
          txn.name,
          txn.merchant_name || null,
          category,
          txn.category || [],
          txn.date,
          txn.pending,
        ]
      );
    }

    // Delete removed transactions (Plaid signals these explicitly)
    for (const txn of removed) {
      await client.query(
        "DELETE FROM transactions WHERE plaid_transaction_id = $1",
        [txn.transaction_id]
      );
    }

    // Persist updated cursor so next sync is incremental
    await client.query(
      "UPDATE plaid_items SET cursor = $1, status = $2, updated_at = NOW() WHERE id = $3",
      [cursor, "good", item.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    added:    added.length,
    modified: modified.length,
    removed:  removed.length,
  };
}

/**
 * Syncs account balances for a Plaid item and upserts into accounts table.
 * Called after exchange-token and on webhook ACCOUNTS_UPDATED.
 *
 * @param {object} item  — row from plaid_items table
 * @param {string} plaidItemRowId — our DB UUID for the plaid_items row
 */
export async function syncAccounts(item, plaidItemRowId) {
  const accessToken = decrypt(item.access_token_enc);

  const res = await plaidClient.accountsGet({ access_token: accessToken });
  const accounts = res.data.accounts;

  for (const acct of accounts) {
    await query(
      `INSERT INTO accounts
         (plaid_item_id, user_id, plaid_account_id, name, official_name,
          type, subtype, mask, balance_current, balance_available, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (plaid_account_id) DO UPDATE SET
         name              = EXCLUDED.name,
         official_name     = EXCLUDED.official_name,
         balance_current   = EXCLUDED.balance_current,
         balance_available = EXCLUDED.balance_available,
         updated_at        = NOW()`,
      [
        plaidItemRowId,
        item.user_id,
        acct.account_id,
        acct.name,
        acct.official_name || null,
        acct.type,
        acct.subtype,
        acct.mask,
        acct.balances.current,
        acct.balances.available,
        acct.balances.iso_currency_code || "USD",
      ]
    );
  }
}
