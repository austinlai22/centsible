/**
 * lib/identities.js — sign-in methods attached to an account.
 *
 * An "identity" is one way of proving you are a given user: a password, a
 * Google account, and later whatever else. The users row is the account; rows
 * in auth_identities are the doors into it.
 *
 * Why this exists as its own module rather than inline queries: the rules
 * below are easy to get subtly wrong in ways that either lock users out or
 * hand their account to someone else, so they live in one place with the
 * reasoning attached.
 */

import { query } from "../db/client.js";

export const PROVIDERS = Object.freeze({ PASSWORD: "password", GOOGLE: "google" });

/** All sign-in methods for a user, newest last. */
export async function listIdentities(userId) {
  const { rows } = await query(
    `SELECT provider, email, created_at, last_used_at
       FROM auth_identities
      WHERE user_id = $1
      ORDER BY created_at ASC`,
    [userId]
  );
  return rows;
}

/** Just the provider names — what /auth/me exposes to the UI. */
export async function listProviders(userId) {
  return (await listIdentities(userId)).map(r => r.provider);
}

/**
 * Attaches a sign-in method to an account.
 *
 * ON CONFLICT makes linking idempotent: clicking "Link Google" twice, or a
 * retried callback, refreshes the row instead of failing or duplicating.
 */
export async function addIdentity(userId, provider, providerUid, email = null) {
  const { rows } = await query(
    `INSERT INTO auth_identities (user_id, provider, provider_uid, email, last_used_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET provider_uid = EXCLUDED.provider_uid,
                   email        = EXCLUDED.email,
                   last_used_at = NOW()
     RETURNING provider, email, created_at, last_used_at`,
    [userId, provider, providerUid, email]
  );
  return rows[0];
}

/**
 * Finds the account behind a provider identity.
 *
 * Deliberately matches on (provider, provider_uid) and NEVER on email. Looking
 * an account up by the email an OAuth provider reports is the standard account
 * takeover route: anyone who can make a provider assert a victim's address —
 * an unverified email on a fresh account, a reassigned corporate mailbox —
 * would be handed the victim's account. provider_uid is the provider's own
 * immutable id, which cannot be claimed by a different person.
 */
export async function findUserByIdentity(provider, providerUid) {
  const { rows } = await query(
    `SELECT u.*
       FROM auth_identities ai
       JOIN users u ON u.id = ai.user_id
      WHERE ai.provider = $1 AND ai.provider_uid = $2`,
    [provider, providerUid]
  );
  return rows[0] || null;
}

/** Stamps last_used_at after a successful sign-in through this provider. */
export async function touchIdentity(userId, provider) {
  await query(
    "UPDATE auth_identities SET last_used_at = NOW() WHERE user_id = $1 AND provider = $2",
    [userId, provider]
  );
}

/**
 * Detaches a sign-in method.
 *
 * Refuses to remove the last one. Unlinking Google from an account that has no
 * password — or clearing a password on a Google-only account — leaves a user
 * with a database row they can never reach again, which for a finance app
 * means losing access to their own transaction history with no recovery path.
 * The check and the delete run in one statement so two concurrent unlink
 * requests can't each observe "2 identities" and both proceed.
 */
export async function removeIdentity(userId, provider) {
  const { rows } = await query(
    `DELETE FROM auth_identities
      WHERE user_id = $1
        AND provider = $2
        AND (SELECT COUNT(*) FROM auth_identities WHERE user_id = $1) > 1
      RETURNING provider`,
    [userId, provider]
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error("You can't remove your only sign-in method. Add another one first."),
      { status: 409 }
    );
  }
  return rows[0];
}
