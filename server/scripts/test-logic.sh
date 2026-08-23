#!/bin/bash
# Server-side logic audit. Asserts what the API should MEAN, not just that it
# responds — a failure here is a reasoning gap.
API=${API:-http://localhost:3999}
pass=0; fail=0
ck(){ if [ "$2" = "1" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1"; echo "        $3"; fail=$((fail+1)); fi; }

J=/tmp/logic.txt; rm -f $J
E="logic$(date +%s)@test.local"; P="testpassword123"
curl -s -c $J -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$E\",\"password\":\"$P\"}" >/dev/null

echo "=== rewards: points cannot be farmed ==="
BEFORE=$(curl -s -b $J $API/api/rewards | grep -o '"points":[0-9]*' | cut -d: -f2)
for i in $(seq 1 20); do
  curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' \
    -d '{"action":"complete_monthly_review"}' >/dev/null
done
AFTER=$(curl -s -b $J $API/api/rewards | grep -o '"points":[0-9]*' | cut -d: -f2)
GAINED=$((AFTER - BEFORE))
echo "        20 identical calls -> +$GAINED points (one claim is worth 20)"
[ "$GAINED" = "20" ] && ck "an action is claimable once per month, not per click" 1 \
  || ck "claim capped at once per month" 0 "gained $GAINED"
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"complete_monthly_review"}')
echo "$R" | grep -q "already claimed" && ck "a repeat claim says so explicitly" 1 || ck "repeat claim message" 0 "$R"

echo
echo "=== rewards: claims are checked against real data ==="
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"set_spending_limit"}')
echo "$R" | grep -q '"error"' && ck "'set a spending limit' refused before any budget exists" 1 \
  || ck "set_spending_limit verified" 0 "awarded with no budgets set: $R"
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"add_goal_funds"}')
echo "$R" | grep -q '"error"' && ck "'add goal funds' refused before any goal is funded" 1 \
  || ck "add_goal_funds verified" 0 "awarded with no funded goals: $R"
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"hit_savings_rate"}')
echo "$R" | grep -q '"error"' && ck "'hit savings rate' refused with no income recorded" 1 \
  || ck "hit_savings_rate verified" 0 "awarded with no income: $R"
# Now satisfy one for real and confirm it IS awarded.
curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' -d '{"Food":600}' >/dev/null
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"set_spending_limit"}')
echo "$R" | grep -q '"earned":10' && ck "once the condition is genuinely met, it IS awarded" 1 || ck "awarded when true" 0 "$R"

echo
echo "=== rewards: redemption is balance-safe ==="
PTS=$(curl -s -b $J $API/api/rewards | grep -o '"points":[0-9]*' | cut -d: -f2)
R=$(curl -s -b $J -X POST $API/api/rewards/redeem -H 'Content-Type: application/json' -d '{"charity_id":3}')
echo "$R" | grep -q '"error"' && ck "cannot redeem a 100pt charity on $PTS points" 1 || ck "overdraw refused" 0 "$R"
for i in $(seq 1 20); do
  curl -s -b $J -X POST $API/api/rewards/redeem -H 'Content-Type: application/json' -d '{"charity_id":5}' >/dev/null
done
PTS=$(curl -s -b $J $API/api/rewards | grep -o '"points":[0-9-]*' | cut -d: -f2)
[ "$PTS" -ge 0 ] && ck "balance never goes negative (got $PTS)" 1 || ck "balance never negative" 0 "NEGATIVE: $PTS"

echo
echo "=== goals: does the server enforce its own invariants? ==="
G=$(curl -s -b $J -X POST $API/api/goals -H 'Content-Type: application/json' \
  -d '{"name":"Audit goal","target":1000,"saved":0}')
GID=$(echo "$G" | sed 's/.*"id":"\([^"]*\)".*/\1/')
R=$(curl -s -b $J -X PUT $API/api/goals/$GID -H 'Content-Type: application/json' -d '{"saved":99999}')
echo "$R" | grep -q '"error"' \
  && ck "saved cannot exceed target" 1 \
  || ck "saved cannot exceed target" 0 "accepted saved=99999 on a target of 1000 -> $(echo $R | head -c 120)"
R=$(curl -s -b $J -X PUT $API/api/goals/$GID -H 'Content-Type: application/json' -d '{"saved":-500}')
echo "$R" | grep -q '"error"' && ck "negative saved rejected" 1 || ck "negative saved rejected" 0 "$R"
R=$(curl -s -b $J -X POST $API/api/goals -H 'Content-Type: application/json' -d '{"name":"x","target":-5}')
echo "$R" | grep -q '"error"' && ck "negative target rejected" 1 || ck "negative target rejected" 0 "$R"
R=$(curl -s -b $J -X POST $API/api/goals -H 'Content-Type: application/json' \
  -d '{"name":"past","target":100,"deadline":"1999-01-01"}')
echo "$R" | grep -q '"error"' && ck "deadline in the past rejected" 1 \
  || ck "deadline in the past rejected" 0 "accepted a 1999 deadline"

echo
echo "=== transactions: sign convention round-trip ==="
R=$(curl -s -b $J -X POST $API/api/transactions -H 'Content-Type: application/json' \
  -d '{"desc":"Paycheck","amount":2000,"category":"Other","type":"income","date":"2026-08-10"}')
echo "$R" | grep -q '"type":"income"' && ck "income round-trips as income" 1 || ck "income round-trips" 0 "$R"
echo "$R" | grep -q '"amount":2000' && ck "income amount comes back positive for display" 1 || ck "income amount positive" 0 "$R"
R=$(curl -s -b $J -X POST $API/api/transactions -H 'Content-Type: application/json' \
  -d '{"desc":"Rent","amount":1500,"category":"Housing","type":"expense","date":"2026-08-10"}')
echo "$R" | grep -q '"type":"expense"' && ck "expense round-trips as expense" 1 || ck "expense round-trips" 0 "$R"
R=$(curl -s -b $J -X POST $API/api/transactions -H 'Content-Type: application/json' \
  -d '{"desc":"Zero","amount":0,"category":"Food","type":"expense","date":"2026-08-10"}')
echo "$R" | grep -q '"error"' && ck "zero-amount transaction rejected" 1 || ck "zero-amount rejected" 0 "accepted amount 0"
R=$(curl -s -b $J -X POST $API/api/transactions -H 'Content-Type: application/json' \
  -d '{"desc":"Future","amount":10,"category":"Food","type":"expense","date":"2099-01-01"}')
echo "$R" | grep -q '"error"' && ck "far-future date rejected" 1 || ck "far-future date rejected" 0 "accepted a 2099 transaction"

echo
echo "=== budgets: period routing ==="
curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' \
  -d '{"Food":600,"Tuition":9000}' >/dev/null
R=$(curl -s -b $J "$API/api/budgets")
echo "$R" | grep -q '"Food":600' && ck "monthly category stored" 1 || ck "monthly stored" 0 "$R"
echo "$R" | grep -q '"Tuition":9000' && ck "semester category stored" 1 || ck "semester stored" 0 "$R"
R=$(curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' -d '{"Food":-100}')
echo "$R" | grep -q '"error"' && ck "negative budget rejected" 1 || ck "negative budget rejected" 0 "$R"
R=$(curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' -d '{"Yacht":90000}')
echo "$R" | grep -q '"error"' && ck "unknown category rejected" 1 || ck "unknown category rejected" 0 "$R"

echo; echo "  PASSED: $pass   FAILED: $fail"
