/**
 * routes/plaid.js — Plaid API proxy
 *
 * All four endpoints are fully implemented here.
 * The frontend never receives or stores a Plaid access_token.
 *
 * POST /plaid/create-link-token
 *   Generates a short-lived Plaid Link token for the frontend to initialise
 *   the Plaid Link SDK. The token expires in 30 minutes and is useless without
 *   a matching exchange, so it's safe to pass to the client.
 *
 * POST /plaid/exchange-token
 *   Receives the one-time public_token from Plaid Link after the user
 *   authenticates. Exchanges it server-side for a long-lived access_token,
 *   encrypts it with AES-256-GCM, stores the ciphertext in plaid_items,
 *   then triggers an initial transaction + account sync.
 *   The access_token never appears in any response body.
 *
 * GET /plaid/transactions
 *   Returns transactions from our DB for the authenticated user.
 *   Accepts optional query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
 *   Scoped strictly to req.userId — impossible to fetch another user's data.
 *
 * GET /plaid/accounts
 *   Returns cached account metadata (balances, masks) for the authenticated user.
 *
 * DELETE /plaid/items/:itemId
 *   Unlinks a bank. Calls Plaid's /item/remove, then deletes the plaid_items row
 *   (cascades to accounts and transactions).
 *
 * POST /plaid/sync
 *   On-demand trigger to re-sync transactions for all of a user's items.
 *   In production this is driven by webhooks (step 5), but this endpoint
 *   lets the frontend trigger a refresh manually.
 *
 * Security:
 *   - All endpoints except /webhook require requireAuth
 *   - Every DB query is parameterised and scoped to req.userId
 *   - access_token is decrypted in memory only, never logged or returned
 *   - IDOR prevented by always joining on user_id in WHERE clauses
 */

import { Router }        from "express";
import { z }             from "zod";
import { Products, CountryCode } from "plaid";
import { plaidClient }   from "../lib/plaid.js";
import { syncItem, syncAccounts } from "../lib/sync.js";
import { encrypt, decrypt }   from "../lib/crypto.js";
import { query }         from "../db/client.js";
import { requireAuth, validateUUID } from "../middleware/auth.js";
import { verifyPlaidWebhook }  from "../middleware/verifyPlaidWebhook.js";

const router = Router();

// All routes except /webhook require a valid session cookie
router.use((req, res, next) => {
  if (req.path === "/webhook") return next();
  return requireAuth(req, res, next);
});

// ─── POST /plaid/create-link-token ───────────────────────────────────────────

router.post("/create-link-token", async (req, res, next) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user:     { client_user_id: req.userId },
      client_name:  "flo·w",
      products:     [Products.Transactions],
      country_codes:[CountryCode.Us],
      language:     "en",
      // Webhook URL — Plaid POSTs here when new transactions are available.
      // Omitted entirely when unset, rather than falling back to a placeholder
      // domain: registering https://your-domain.com/plaid/webhook makes Plaid
      // deliver every event for this Item to a host you don't control, and the
      // resulting silence looks identical to "webhooks aren't working yet."
      // With no webhook registered, sync still works on demand via POST
      // /plaid/sync — which is the right setup for local sandbox testing
      // without ngrok.
      ...(process.env.PLAID_WEBHOOK_URL ? { webhook: process.env.PLAID_WEBHOOK_URL } : {}),
    });

    // link_token is short-lived (30 min) and can only be used once —
    // safe to send to the frontend for Plaid Link initialisation.
    return res.json({ link_token: response.data.link_token });
  } catch (err) {
    next(err);
  }
});

// ─── POST /plaid/exchange-token ───────────────────────────────────────────────

const ExchangeSchema = z.object({
  public_token:     z.string().min(1),
  institution_id:   z.string().optional(),
  institution_name: z.string().max(120).optional(),
});

router.post("/exchange-token", async (req, res, next) => {
  try {
    const parsed = ExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { public_token, institution_id, institution_name } = parsed.data;

    // Exchange public_token → access_token (server-side only)
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    // Encrypt before writing — access_token never touches the DB in plaintext
    const access_token_enc = encrypt(access_token);

    // Check if this item is already linked for this user (re-link scenario)
    const existing = await query(
      "SELECT id FROM plaid_items WHERE plaid_item_id = $1 AND user_id = $2",
      [item_id, req.userId]
    );

    let itemRow;
    if (existing.rows.length > 0) {
      // Re-link: update the token (e.g. user re-authenticated after an error)
      const upd = await query(
        `UPDATE plaid_items
         SET access_token_enc = $1, status = 'good', cursor = NULL, updated_at = NOW()
         WHERE plaid_item_id = $2 AND user_id = $3
         RETURNING *`,
        [access_token_enc, item_id, req.userId]
      );
      itemRow = upd.rows[0];
    } else {
      // New link
      const ins = await query(
        `INSERT INTO plaid_items
           (user_id, plaid_item_id, plaid_institution_id, institution_name, access_token_enc)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.userId, item_id, institution_id || null, institution_name || null, access_token_enc]
      );
      itemRow = ins.rows[0];
    }

    // Pass a plain object with user_id so syncItem/syncAccounts have what they need
    const itemForSync = { ...itemRow, access_token_enc };

    // Initial sync — run in background, don't block the response
    // The frontend can poll GET /plaid/transactions while this runs.
    (async () => {
      try {
        await syncAccounts(itemForSync, itemRow.id);
        await syncItem(itemForSync);
      } catch (syncErr) {
        console.error("[plaid] Initial sync error for item", item_id, syncErr.message);
        await query(
          "UPDATE plaid_items SET status = 'error' WHERE id = $1 AND user_id = $2",
          [itemRow.id, req.userId]
        );
      }
    })();

    return res.json({
      item_id,
      institution_name: institution_name || null,
      status: "syncing", // tell the frontend a background sync is in progress
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /plaid/transactions ──────────────────────────────────────────────────

const TransactionQuerySchema = z.object({
  from:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

router.get("/transactions", async (req, res, next) => {
  try {
    const parsed = TransactionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { from, to, limit } = parsed.data;

    // All conditions include user_id = $1 — impossible to return another user's data
    const conditions = ["user_id = $1"];
    const params     = [req.userId];

    if (from) { conditions.push(`date >= $${params.push(from)}`); }
    if (to)   { conditions.push(`date <= $${params.push(to)}`);   }

    const { rows } = await query(
      `SELECT
         id,
         plaid_transaction_id,
         plaid_account_id,
         amount,
         currency_code,
         COALESCE(merchant_name, description) AS desc,
         category,
         -- TO_CHAR, not the bare DATE column: node-postgres hydrates DATE
         -- into a JS Date, which res.json() then serialises as a full ISO
         -- timestamp ("2025-05-18T00:00:00.000Z"). The UI renders t.date raw
         -- and feeds it to <input type="date">, which only accepts
         -- YYYY-MM-DD — so bank rows showed a timestamp in the list and blanked
         -- the date field on edit. routes/data.js already returns YYYY-MM-DD
         -- for manual rows; this makes both sources agree.
         TO_CHAR(date, 'YYYY-MM-DD') AS date,
         pending,
         source
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       ORDER BY date DESC, created_at DESC
       LIMIT $${params.push(limit)}`,
      params
    );

    return res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /plaid/accounts ──────────────────────────────────────────────────────

router.get("/accounts", async (req, res, next) => {
  try {
    // Join to plaid_items to surface institution name alongside account data.
    // Both tables are filtered by user_id — no IDOR possible.
    const { rows } = await query(
      `SELECT
         a.plaid_account_id  AS id,
         -- The UI's "Remove" button calls DELETE /plaid/items/:itemId, which
         -- runs validateUUID. Without this column the frontend fell back to
         -- a.id (a Plaid account string, not a UUID) and every removal
         -- returned 400 Invalid ID format.
         pi.id               AS plaid_item_id,
         a.name,
         a.official_name,
         a.type,
         a.subtype,
         a.mask,
         a.balance_current,
         a.balance_available,
         a.currency_code,
         a.updated_at,
         pi.institution_name,
         pi.status          AS item_status
       FROM accounts a
       JOIN plaid_items pi ON pi.id = a.plaid_item_id
       WHERE a.user_id = $1
       ORDER BY pi.institution_name, a.name`,
      [req.userId]
    );

    return res.json({ accounts: rows });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /plaid/items/:itemId ──────────────────────────────────────────────

router.delete("/items/:itemId", validateUUID("itemId"), async (req, res, next) => {
  try {
    // Confirm the item belongs to this user before touching it
    const { rows } = await query(
      "SELECT * FROM plaid_items WHERE id = $1 AND user_id = $2",
      [req.params.itemId, req.userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = rows[0];

    // Tell Plaid to invalidate the access_token on their side
    try {
      const accessToken = decrypt(item.access_token_enc);
      await plaidClient.itemRemove({ access_token: accessToken });
    } catch (plaidErr) {
      // Log but continue — we still want to remove it from our DB
      console.warn("[plaid] itemRemove error (continuing):", plaidErr.message);
    }

    // Cascade delete removes accounts and transactions automatically
    await query(
      "DELETE FROM plaid_items WHERE id = $1 AND user_id = $2",
      [req.params.itemId, req.userId]
    );

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /plaid/sync ─────────────────────────────────────────────────────────
// On-demand sync for all items belonging to the authenticated user.
// In production this is triggered by webhooks; this endpoint is for
// manual refreshes from the frontend.

router.post("/sync", async (req, res, next) => {
  try {
    const { rows: items } = await query(
      "SELECT * FROM plaid_items WHERE user_id = $1 AND status != 'relink_required'",
      [req.userId]
    );

    if (items.length === 0) {
      return res.json({ message: "No linked accounts to sync", synced: 0 });
    }

    // Run syncs in parallel (one per item)
    const results = await Promise.allSettled(items.map(item => syncItem(item)));

    const summary = results.map((r, i) => ({
      item_id: items[i].plaid_item_id,
      status:  r.status,
      ...(r.status === "fulfilled" ? r.value : { error: r.reason?.message }),
    }));

    return res.json({ synced: items.length, summary });
  } catch (err) {
    next(err);
  }
});


// --- POST /plaid/webhook -----------------------------------------------------------
// Signature-verified via verifyPlaidWebhook middleware.
// Plaid retries on any non-2xx, so we always return 200 and handle errors internally.
//
// Events handled:
//   SYNC_UPDATES_AVAILABLE  -- new transactions ready; run incremental sync
//   ITEM ERROR/LOGIN/EXPIRY -- mark item status so the user can re-link
//   Everything else         -- acknowledged silently (no retry needed)

router.post("/webhook", verifyPlaidWebhook, async (req, res, next) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  console.log(`[webhook] ${webhook_type}/${webhook_code} item=${item_id}`);

  try {
    switch (webhook_type) {

      case "TRANSACTIONS": {
        if (webhook_code === "SYNC_UPDATES_AVAILABLE") {
          const { rows } = await query(
            "SELECT * FROM plaid_items WHERE plaid_item_id = $1",
            [item_id]
          );
          if (rows[0]) {
            // Fire sync in background so we respond to Plaid immediately
            syncItem(rows[0]).catch(err =>
              console.error("[webhook] sync error:", err.message)
            );
          }
        }
        break;
      }

      case "ITEM": {
        const STATUS_MAP = {
          "ERROR":              "error",
          "ITEM_LOGIN_REQUIRED":"relink_required",
          "PENDING_EXPIRATION": "relink_required",
        };
        const newStatus = STATUS_MAP[webhook_code];
        if (newStatus) {
          await query(
            "UPDATE plaid_items SET status = $1, updated_at = NOW() WHERE plaid_item_id = $2",
            [newStatus, item_id]
          );
        }
        break;
      }

      default:
        // Unknown or future event type -- acknowledge to prevent retries
        break;
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
