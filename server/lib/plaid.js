/**
 * lib/plaid.js — Plaid SDK client + category normalisation
 *
 * Single shared PlaidApi instance used by all routes.
 * Credentials come exclusively from env vars — never hardcoded.
 *
 * Category normalisation:
 *   Plaid returns a hierarchy like ["Food and Drink", "Restaurants", "Fast Food"].
 *   We map those to our app's eight categories so the frontend always sees
 *   consistent labels regardless of what Plaid sends.
 */

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// ─── Client ───────────────────────────────────────────────────────────────────

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set in .env");
}

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET":    process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(config);

// ─── Category normalisation ───────────────────────────────────────────────────
// Plaid personal_finance_category primary values → our app categories.
// Extend this map as needed; unmapped categories fall through to "Other".

const PLAID_TO_APP = {
  // Housing / utilities
  "RENT_AND_UTILITIES":              "Housing",
  "HOME_IMPROVEMENT":                "Housing",

  // Food
  "FOOD_AND_DRINK":                  "Food",
  "RESTAURANTS":                     "Food",
  "GROCERIES":                       "Food",

  // Transport
  "TRANSPORTATION":                  "Transport",
  "TRAVEL":                          "Transport",
  "GAS_STATIONS":                    "Transport",

  // Health
  "MEDICAL":                         "Health",
  "PERSONAL_CARE":                   "Health",
  "GYMS_AND_FITNESS_CENTERS":        "Health",
  "PHARMACIES_AND_SUPPLEMENTS":      "Health",

  // Shopping
  "GENERAL_MERCHANDISE":             "Shopping",
  "ONLINE_MARKETPLACES":             "Shopping",
  "CLOTHING_AND_ACCESSORIES":        "Shopping",
  "ELECTRONICS":                     "Shopping",

  // Entertainment
  "ENTERTAINMENT":                   "Entertainment",
  "ARTS_AND_ENTERTAINMENT":          "Entertainment",
  "MUSIC_AND_AUDIO":                 "Entertainment",
  "TV_AND_MOVIES":                   "Entertainment",
  "SPORTING_GOODS":                  "Entertainment",

  // Savings / transfers
  "TRANSFER_IN":                     "Savings",
  "TRANSFER_OUT":                    "Savings",
  "SAVINGS":                         "Savings",

  // Income
  "INCOME":                          "Other",
  "PAYROLL":                         "Other",
};

/**
 * DETAILED-level overrides, checked before the primary-level map above.
 *
 * LOAN_PAYMENTS is one primary category covering several genuinely different
 * things — a credit card payment, a mortgage, a car loan, a student loan —
 * and only ONE of those is a transfer. A mortgage or student loan payment is
 * real recurring spending a budget needs to see; paying off a credit card is
 * settling a debt for purchases already made (tracked elsewhere if that card
 * is itself linked, untrackable by this app at all if it isn't) — either way,
 * counting the payment AGAIN as an expense double-counts money that already
 * left the picture once. Matching on `primary` alone can't tell these apart;
 * per Plaid's own taxonomy (plaid.com/documents/pfc-taxonomy-all.csv) the
 * distinction lives entirely in `detailed`.
 */
const PLAID_DETAILED_TO_APP = {
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT": "CreditCardPayment",
};

/**
 * Maps a Plaid personal_finance_category to our app category.
 * Falls back to "Other" for anything unmapped.
 *
 * @param {string|null} primary  — e.g. "FOOD_AND_DRINK"
 * @param {string|null} detailed — e.g. "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"
 * @returns {string}  One of the app's category labels
 */
export function normaliseCategory(primary, detailed) {
  if (detailed && PLAID_DETAILED_TO_APP[detailed]) return PLAID_DETAILED_TO_APP[detailed];
  if (!primary) return "Other";
  // Exact match first
  if (PLAID_TO_APP[primary]) return PLAID_TO_APP[primary];
  // Prefix match — handles sub-variants Plaid may add
  const key = Object.keys(PLAID_TO_APP).find(k => primary.startsWith(k));
  return key ? PLAID_TO_APP[key] : "Other";
}
