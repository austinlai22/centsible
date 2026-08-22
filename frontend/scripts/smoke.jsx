/* Render smoke test: mounts every page with react-dom/server to catch broken
   imports, missing exports, and crashes on empty/degenerate props. */
import { renderToStaticMarkup } from "react-dom/server";
import { AuthScreen } from "../src/pages/AuthScreen.jsx";
import { Onboarding } from "../src/pages/Onboarding.jsx";
import Summary from "../src/pages/Summary.jsx";
import Budget from "../src/pages/Budget.jsx";
import Transactions from "../src/pages/Transactions.jsx";
import Goals from "../src/pages/Goals.jsx";
import About from "../src/pages/About.jsx";
import { RewardsContent } from "../src/pages/Rewards.jsx";
import { DEMO_TRANSACTIONS, DEMO_GOALS, DEMO_BUDGETS } from "../src/constants.js";

let pass = 0, fail = 0;
const noop = () => {};
const asyncNoop = async () => {};

function t(label, el, expect) {
  try {
    const html = renderToStaticMarkup(el);
    if (expect && !html.includes(expect)) throw new Error(`missing expected text: ${expect}`);
    console.log(`  PASS  ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  ${label}\n          ${e.message}`);
    fail++;
  }
}

const profile = { name: "Austin", email: "a@b.c" };
const rewards = { points: 340, redeemed: [], earn: asyncNoop, redeem: asyncNoop };

console.log("=== with data ===");
t("AuthScreen", <AuthScreen onAuth={noop}/>, "Welcome back");
t("Onboarding", <Onboarding onComplete={noop}/>, "What should we call you?");
t("Summary", <Summary profile={profile} transactions={DEMO_TRANSACTIONS} goals={DEMO_GOALS}
      points={340} accounts={[]} loading={false} error={null} reload={noop}/>, "Spending breakdown");
t("Budget", <Budget transactions={DEMO_TRANSACTIONS} budgets={DEMO_BUDGETS} setBudgets={asyncNoop}
      budgetsLoading={false} budgetsError={null} reloadBudgets={noop}
      txnLoading={false} txnError={null} reloadTxns={noop}
      period="monthly" setPeriod={noop} refDate={new Date("2025-05-18T12:00:00")}
      setRefDate={noop} goToToday={noop}/>, "Housing");
t("Budget (semester view)", <Budget transactions={DEMO_TRANSACTIONS} budgets={DEMO_BUDGETS} setBudgets={asyncNoop}
      budgetsLoading={false} budgetsError={null} reloadBudgets={noop}
      txnLoading={false} txnError={null} reloadTxns={noop}
      period="semester" setPeriod={noop} refDate={new Date("2025-05-18T12:00:00")}
      setRefDate={noop} goToToday={noop}/>, "Tuition");
t("Transactions", <Transactions transactions={DEMO_TRANSACTIONS} loading={false} error={null}
      reload={noop} addTxn={asyncNoop} updateTxn={asyncNoop} deleteTxn={asyncNoop}/>, "Whole Foods");
t("Goals", <Goals goals={DEMO_GOALS} loading={false} error={null} reload={noop}
      addGoal={asyncNoop} updateGoal={asyncNoop} deleteGoal={asyncNoop} addFunds={asyncNoop}/>, "Japan trip");
t("Rewards", <RewardsContent {...rewards}/>, "How to earn points");
t("About", <About profile={profile} setProfile={noop} {...rewards}
      accounts={[]} accountsLoading={false} accountsError={null} reloadAccounts={noop}
      onLogout={noop}/>, "Delete my account");

console.log("\n=== degenerate props (empty / undefined) ===");
t("Summary empty", <Summary profile={{}} transactions={[]} goals={[]} points={0}
      accounts={undefined} loading={false} error={null} reload={noop}/>, "No spending recorded");
t("Budget empty", <Budget transactions={[]} budgets={{}} setBudgets={asyncNoop}
      budgetsLoading={false} budgetsError={null} reloadBudgets={noop}
      txnLoading={false} txnError={null} reloadTxns={noop}
      period="monthly" setPeriod={noop} refDate={new Date()} setRefDate={noop} goToToday={noop}/>, "Not set");
t("Transactions empty", <Transactions transactions={[]} loading={false} error={null}
      reload={noop} addTxn={asyncNoop} updateTxn={asyncNoop} deleteTxn={asyncNoop}/>, "No transactions found");
t("Goals empty", <Goals goals={[]} loading={false} error={null} reload={noop}
      addGoal={asyncNoop} updateGoal={asyncNoop} deleteGoal={asyncNoop} addFunds={asyncNoop}/>, "No goals yet");
t("Rewards max level", <RewardsContent {...rewards} points={9999}/>, "Flow Master");
t("Summary error state", <Summary profile={{}} transactions={[]} goals={[]} points={0}
      accounts={[]} loading={false} error="Network down" reload={noop}/>, "Retry");
t("Summary relink banner", <Summary profile={{}} transactions={[]} goals={[]} points={0}
      accounts={[{id:"1",name:"Chase",item_status:"relink_required"}]} loading={false} error={null} reload={noop}/>, "Action needed");

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
if (fail) process.exit(1);
