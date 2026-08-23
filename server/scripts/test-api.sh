#!/bin/bash
# End-to-end check of the fixed server flows.
API=http://localhost:3999
J=/tmp/flow-cookies.txt
rm -f $J
EMAIL="e2e$(date +%s)@test.local"
pass=0; fail=0
check(){ # label, condition-result, detail
  if [ "$2" = "1" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1"; echo "          $3"; fail=$((fail+1)); fi
}

echo "=== AUTH ==="
R=$(curl -s -c $J -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"testpassword123\",\"name\":\"E2E\"}")
echo "$R" | grep -q '"user"' && check "register" 1 || check "register" 0 "$R"
grep -q access_token $J && check "access_token cookie set" 1 || check "access_token cookie set" 0 "no cookie"
grep -q refresh_token $J && check "refresh_token cookie set" 1 || check "refresh_token cookie set" 0 "no cookie"

R=$(curl -s -b $J $API/auth/me)
echo "$R" | grep -q "$EMAIL" && check "GET /auth/me" 1 || check "GET /auth/me" 0 "$R"
echo "$R" | grep -q password_hash && check "password_hash NOT leaked" 0 "leaked!" || check "password_hash NOT leaked" 1

echo
echo "=== BUDGETS (was 500 on every call) ==="
R=$(curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' \
  -d '{"Food":600,"Housing":2000,"Tuition":9000}')
echo "$R" | grep -q '"budgets"' && check "PUT mixed monthly+semester" 1 || check "PUT mixed monthly+semester" 0 "$R"
echo "$R" | grep -q '"Food":600' && echo "$R" | grep -q '"Tuition":9000' \
  && check "monthly + semester both stored" 1 || check "monthly + semester both stored" 0 "$R"

R=$(curl -s -b $J "$API/api/budgets")
echo "$R" | grep -q '"Tuition":9000' && check "GET returns them back" 1 || check "GET returns them back" 0 "$R"

R=$(curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' -d '{"Food":650}')
echo "$R" | grep -q '"Food":650' && check "re-upsert overwrites (no dup key)" 1 || check "re-upsert overwrites (no dup key)" 0 "$R"

R=$(curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' -d '{"Yacht":90000}')
echo "$R" | grep -q '"error"' && check "unknown category rejected" 1 || check "unknown category rejected" 0 "$R"

echo
echo "=== MANUAL TRANSACTIONS ==="
R=$(curl -s -b $J -X POST $API/api/transactions -H 'Content-Type: application/json' \
  -d '{"desc":"Coffee","amount":4.5,"category":"Food","type":"expense","date":"2025-05-18"}')
echo "$R" | grep -q '"source":"manual"' && check "create manual txn" 1 || check "create manual txn" 0 "$R"
TID=$(echo "$R" | sed 's/.*"id":"\([^"]*\)".*/\1/')

R=$(curl -s -b $J "$API/plaid/transactions?limit=10")
echo "$R" | grep -q '"desc":"Coffee"' && check "GET /plaid/transactions merges manual rows" 1 || check "GET /plaid/transactions merges manual rows" 0 "$R"
echo "$R" | grep -qE '"date":"[0-9]{4}-[0-9]{2}-[0-9]{2}"' \
  && check "date is YYYY-MM-DD (not ISO timestamp)" 1 || check "date is YYYY-MM-DD (not ISO timestamp)" 0 "$R"

R=$(curl -s -b $J -X PUT $API/api/transactions/$TID -H 'Content-Type: application/json' -d '{"amount":5.25}')
echo "$R" | grep -q '"amount":5.25' && check "update manual txn" 1 || check "update manual txn" 0 "$R"

echo
echo "=== REWARDS ==="
# complete_monthly_review is the one action with no data precondition (a
# "review" leaves no trace the server can check), so it exercises the award
# path. Everything else is verified against real data — see test-logic.sh.
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"complete_monthly_review"}')
echo "$R" | grep -q '"earned":20' && check "earn uses SERVER point value" 1 || check "earn uses SERVER point value" 0 "$R"
R=$(curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"made_up_action"}')
echo "$R" | grep -q '"error"' && check "unknown earn action rejected" 1 || check "unknown earn action rejected" 0 "$R"
# Fund the account enough to redeem: budgets + a funded goal are both verifiable.
curl -s -b $J -X PUT "$API/api/budgets" -H 'Content-Type: application/json' -d '{"Food":600}' >/dev/null
curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"set_spending_limit"}' >/dev/null
GG=$(curl -s -b $J -X POST $API/api/goals -H 'Content-Type: application/json' -d '{"name":"Fund","target":100,"saved":10}')
curl -s -b $J -X POST $API/api/rewards/earn -H 'Content-Type: application/json' -d '{"action":"add_goal_funds"}' >/dev/null
R=$(curl -s -b $J -X POST $API/api/rewards/redeem -H 'Content-Type: application/json' -d '{"charity_id":5}')
echo "$R" | grep -q '"charity_name":"Food Bank Network"' && check "redeem prices server-side" 1 || check "redeem prices server-side" 0 "$R"
R=$(curl -s -b $J -X POST $API/api/rewards/redeem -H 'Content-Type: application/json' -d '{"charity_id":3}')
echo "$R" | grep -q 'Insufficient points' && check "overspend blocked atomically" 1 || check "overspend blocked atomically" 0 "$R"
R=$(curl -s -b $J $API/api/rewards/history)
echo "$R" | grep -q '"points_spent":40' && check "history returns redemption" 1 || check "history returns redemption" 0 "$R"

echo
echo "=== REFRESH ROTATION + REUSE DETECTION ==="
OLD=$(grep refresh_token $J | awk '{print $NF}')
R=$(curl -s -b $J -c $J -w '%{http_code}' -o /dev/null -X POST $API/auth/refresh)
[ "$R" = "200" ] && check "refresh rotates" 1 || check "refresh rotates" 0 "http $R"
NEW=$(grep refresh_token $J | awk '{print $NF}')
[ "$OLD" != "$NEW" ] && check "new token differs from old" 1 || check "new token differs from old" 0 "same token"

# Replay the spent token — this is the theft signal.
R=$(curl -s -w '%{http_code}' -o /dev/null -X POST $API/auth/refresh -H "Cookie: refresh_token=$OLD")
[ "$R" = "401" ] && check "replaying spent token -> 401" 1 || check "replaying spent token -> 401" 0 "http $R"

# Family revocation: the CURRENT token should now be dead too.
R=$(curl -s -w '%{http_code}' -o /dev/null -X POST $API/auth/refresh -H "Cookie: refresh_token=$NEW")
[ "$R" = "401" ] && check "reuse revoked the whole family" 1 || check "reuse revoked the whole family" 0 "http $R (family NOT revoked)"

echo
echo "=== IDOR / VALIDATION ==="
R=$(curl -s -w '%{http_code}' -o /dev/null $API/api/goals)
[ "$R" = "401" ] && check "unauthenticated /api/goals -> 401" 1 || check "unauthenticated /api/goals -> 401" 0 "http $R"
R=$(curl -s -b $J -w '%{http_code}' -o /dev/null $API/api/transactions/not-a-uuid -X DELETE)
[ "$R" = "400" ] || [ "$R" = "401" ] && check "malformed UUID rejected" 1 || check "malformed UUID rejected" 0 "http $R"

echo
echo "=================================="
echo "  PASSED: $pass    FAILED: $fail"
echo "=================================="
[ "$fail" = "0" ] || exit 1
