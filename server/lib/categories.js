/**
 * lib/categories.js — the server's authoritative category catalogue.
 *
 * Mirrors CATEGORY_META in frontend/src/constants.js. It lives in one module
 * rather than being repeated per-route because the two copies drifting is not
 * a hypothetical: routes/data.js and routes/rewards.js each kept their own
 * idea of which categories were "one-off", and the disagreement surfaced as
 * the app openly contradicting itself — the Summary showed an 85% savings
 * rate while the rewards check, using a different exclusion list, refused the
 * same month at -365%.
 *
 *   "monthly"  — a recurring habit; its number is a monthly rate.
 *   "semester" — a once-a-term lump sum (tuition, an aid refund); its number
 *                is a flat total for the whole term. These are excluded from
 *                monthly rates on both sides, because one $9,000 bill says
 *                nothing about how someone is managing week to week.
 */

export const CATEGORY_PERIOD = {
  Housing: "monthly", Food: "monthly", Transport: "monthly", Health: "monthly",
  Shopping: "monthly", Entertainment: "monthly", Savings: "monthly", Other: "monthly",
  // A credit card bill payment settles a debt for purchases already made
  // (tracked under their own categories, on this card or nowhere this app
  // can see) — counting the payment ITSELF as an expense double-counts that
  // spending a second time. Transfer, like Savings, for the same reason.
  CreditCardPayment: "monthly",
  // Disbursement is aid ARRIVING — the single most important thing a student
  // on this app logs. Omitting it made VALID_CATEGORIES reject it, so
  // POST /api/transactions answered the app's central action with a 400 while
  // the Add-Transaction form offered it as the DEFAULT one-time category.
  Disbursement: "semester",
  Tuition: "semester", HousingDeposit: "semester", HealthInsurance: "semester",
  BooksSupplies: "semester", Moving: "semester",
};

export const VALID_CATEGORIES = Object.keys(CATEGORY_PERIOD);

/**
 * Movements between the user's own accounts — neither income nor spending.
 * Counting them inflates both sides at once and makes saving money look like
 * a worse savings rate.
 */
export const TRANSFER_CATEGORIES = ["Savings", "CreditCardPayment"];

/**
 * Categories that must not touch a MONTHLY income/expense rate: every
 * once-a-term lump sum, plus transfers.
 */
export const NON_MONTHLY_CATEGORIES = [
  ...Object.entries(CATEGORY_PERIOD)
    .filter(([, period]) => period === "semester")
    .map(([category]) => category),
  ...TRANSFER_CATEGORIES,
];
