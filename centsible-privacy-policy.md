# Centsible Privacy Policy

**Effective date:** August 28, 2026  
**Plain-language summary at the top — full details below.**

---

## The short version

- We collect only what we need to make the app work for you.
- We do not sell your data. Ever. To anyone.
- We do not use your financial data to train AI models or for advertising.
- You can export or delete everything we have on you, at any time, in minutes.
- If something changes, we'll tell you clearly before it takes effect — not buried in a policy update.

---

## 1. Who we are

Centsible is a personal finance app built to help you understand and improve your relationship with money. It is currently operated by **Austin Lai**, an individual based in California, United States, as an independent, unincorporated project — not yet a registered company ("Centsible," "we," "us," or "our"). If that changes, this section will be updated to name the entity, and you'll be notified per §9.

Questions about this policy: **contact@example.com**

A physical mailing address isn't required for this policy under California law (CalOPPA) — email is the fastest way to reach us and the one we actually check.

---

## 2. What we collect and why

We believe in collecting the minimum necessary to deliver a genuinely useful product. Here is everything we collect, and the specific reason for each.

### 2a. Information you give us directly

| What | Why |
|------|-----|
| Name | To personalize your experience |
| Email address | To identify your account, sign you in, and contact you about account or security issues |
| Your term dates, and optionally your course stage and expected financial aid | To work out how long your money has to last, and when your next payment arrives |
| Transactions you manually enter | To power your budget, spending breakdowns, and goal tracking |
| Savings goals you create | To track your progress and send you milestone notifications |
| Spending limits and budget amounts | To generate alerts and summaries |
| Phone number (optional) | To secure your account with multi-factor authentication, and to reach you about account or security issues. Never used for marketing. |

Your phone number is **optional** — the app works fully without it, and you can
clear it at any time from Settings → Personal info.

We do **not** collect your home address. If that ever changes, we will say so
here and tell you why before it takes effect (see §9).

### 2b. Information from your bank (if you connect an account)

If you choose to connect a financial account, we work with **Plaid Inc.** (or a comparable financial data provider) to retrieve your transaction history and balances. Here is what that means in practice:

- **We never see your bank username or password.** Plaid handles authentication directly with your bank using secure OAuth flows.
- **We retrieve:** transaction descriptions, amounts, dates, merchant categories, and account balances.
- **We do not retrieve:** your Social Security number, full account numbers, credit scores, or any data beyond what is needed to show you your spending.
- Your bank data is **encrypted in transit and at rest**.
- You can disconnect your bank account at any time from Settings → Connected Accounts. When you do, we stop retrieving new data immediately.
- Plaid's own data practices are governed by [Plaid's privacy policy](https://plaid.com/legal). We recommend reading it.

### 2c. Information collected automatically

| What | Why |
|------|-----|
| App version, device OS type | To fix bugs and ensure compatibility |
| Crash logs and error reports | To identify and resolve technical problems |

We do **not** collect your precise location, contacts, camera, or microphone. We will always ask before accessing any device sensor, and you can say no.

### 2d. What we do NOT collect

To be explicit:
- We do not collect your Social Security number or government ID
- We do not collect biometric data
- We do not build advertising profiles
- We do not collect data from your other apps
- We do not track you across websites

---

## 3. How we use your information

Your data is used for exactly one purpose: **making Centsible work well for you.**

Specifically:
- Displaying your spending summaries, budget progress, and goal tracking
- Generating alerts (e.g. when you approach a spending limit)
- Calculating your financial health score and milestone rewards
- Sending you notifications you've opted into (e.g. weekly summaries)
- Improving the app based on aggregate, anonymized usage patterns
- Responding to your support requests

We do **not** use your financial data to:
- Train machine learning or AI models
- Serve you advertisements
- Build profiles for sale to third parties
- Make automated decisions that affect your financial standing (we are not a lender or credit bureau)

---

## 4. Who we share your data with

We share the minimum necessary with a small number of service providers who help us operate the app. Every provider is contractually required to use your data only for the specific service they provide — nothing else.

| Provider | Purpose | Data shared |
|----------|---------|-------------|
| Plaid | Bank account connection | Credentials handled by Plaid directly; we receive transaction data only |
| Neon | Database hosting | Encrypted user data |
| Render | API hosting | Encrypted user data, in transit only — not stored by Render itself |
| Vercel | Hosts the app you're using | Standard web request metadata (e.g. IP address) inherent to serving any page |
| Sentry | Error tracking | Crash reports and stack traces — never your financial data, which lives in separate storage Sentry has no access to |

**We do not share your data with:**
- Advertisers or ad networks
- Data brokers
- Other Centsible users
- Any third party for their own marketing purposes

We may disclose information if required by law (e.g. a valid court order), but we will notify you unless legally prohibited from doing so, and we will push back on overbroad requests.

---

## 5. Your rights and controls

You are in control of your data. Here is what you can do, and how:

**Access:** Request a full export of everything we have about you by emailing contact@example.com. We'll send a structured file (JSON or CSV) within 7 days. (There's no self-service export button in the app yet — for now this is a manual request, answered by a person.)

**Correction:** If any of your data is inaccurate, you can edit it directly in the app, or contact us to do it for you.

**Deletion:** You can delete your account and all associated data at any time from **About → Delete my account**. We will permanently delete your data within 30 days, except where we are required by law to retain certain records (e.g. billing records for up to 7 years, per U.S. tax law — we will tell you exactly what is retained and why).

**Disconnect bank accounts:** Go to **About → Connected banks** at any time.

**California residents:** CCPA's own legal thresholds (roughly $26.6M in annual revenue, or personal information from 100,000+ CA consumers or households) don't currently apply to us — we're a small, individually-run project. We choose to offer the same core rights anyway — to know what we collect, to delete it, to opt out of any sale (we don't sell it, to anyone, ever), and to non-discrimination for exercising these rights — because we think they're the right baseline regardless of what the law requires of us at this size.

**Other U.S. state residents:** We extend the same rights to all users regardless of state law.

---

## 6. Data retention

We keep your data for as long as your account is active, plus a brief window afterward to handle any final requests or disputes. Specifically:

- **Active account data:** retained until you delete your account
- **Deleted account data:** purged within 30 days of deletion
- **Anonymized aggregate analytics:** may be retained indefinitely (these contain no personally identifying information)
- **Billing records:** retained for 7 years as required by U.S. tax law

We do not hold onto data "just in case." When it's no longer needed, it's gone.

---

## 7. Security

We take security seriously because your financial data deserves it. Our practices include:

- **Encryption in transit:** all data transmitted between your device and our servers uses TLS 1.3
- **Encryption at rest:** all stored data is encrypted using AES-256
- **Access controls:** only a small number of Centsible employees can access production data, and only when required to resolve a support issue. All access is logged and audited.
- **No plaintext credentials:** we never store bank usernames or passwords
- **Regular security reviews:** we conduct periodic security audits and vulnerability assessments

No system is perfectly secure. If we ever experience a breach affecting your data, we will notify you within 72 hours of discovery — faster than most laws require, because you deserve to know promptly.

---

## 8. Children's privacy

Centsible is not directed at children under 13. We do not knowingly collect personal information from anyone under 13. If you believe a child has provided us with their information, please contact us at contact@example.com and we will delete it promptly.

---

## 9. Changes to this policy

If we make material changes to this policy — meaning changes that affect your rights or how we use your data in ways that matter — we will:

1. Notify you in the app at least 30 days before the change takes effect
2. Send an email to the address on your account
3. Require you to affirmatively acknowledge the change before it applies to you

We will not make retroactive changes that apply to data we already have without your consent.

Minor changes (fixing typos, clarifying language without changing meaning) will be noted in the changelog below without a notification requirement.

---

## 10. Contact us

If you have questions, concerns, or requests about your privacy:

**Email:** contact@example.com  
**Response time:** We aim to respond within 2 business days.

If you feel we haven't adequately addressed a concern, you may have the right to lodge a complaint with your state's attorney general office or a relevant consumer protection authority.

---

## Changelog

| Date | Change |
|------|--------|
| August 28, 2026 | Named the actual operator (an individual, not an incorporated company) in place of placeholder text; dropped the mailing-address requirement (not legally required — see §1); corrected §2c, §4, and §5 to describe only features that actually exist in the app today (no analytics collection, no self-service export button yet); filled in the real service providers in §4 |
| May 20, 2025 | Initial policy published |

