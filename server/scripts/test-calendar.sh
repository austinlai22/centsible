#!/bin/bash
# Terms and disbursements — the inputs the runway depends on.
API=${API:-http://localhost:3001}   # see test-api.sh
pass=0; fail=0
ck(){ if [ "$2" = "1" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1"; echo "        $3"; fail=$((fail+1)); fi; }

J=/tmp/cal.txt; rm -f $J
E="cal$(date +%s)@test.local"
curl -s -c $J -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$E\",\"password\":\"testpassword123\"}" >/dev/null

echo "=== terms ==="
R=$(curl -s -b $J $API/api/terms)
echo "$R" | grep -q '"terms":\[\]' && ck "a new account has no terms (falls back to the built-in calendar)" 1 || ck "starts empty" 0 "$R"

R=$(curl -s -b $J -X POST $API/api/terms -H 'Content-Type: application/json' \
  -d '{"name":"Michaelmas 2026","start_date":"2026-10-05","end_date":"2026-12-11"}')
TID=$(echo "$R" | sed 's/.*"id":"\([^"]*\)".*/\1/')
echo "$R" | grep -q '"name":"Michaelmas 2026"' && ck "creates a non-US term" 1 || ck "creates a term" 0 "$R"
echo "$R" | grep -q '"start_date":"2026-10-05"' && ck "dates round-trip as YYYY-MM-DD" 1 || ck "date format" 0 "$R"

R=$(curl -s -b $J -X POST $API/api/terms -H 'Content-Type: application/json' \
  -d '{"name":"Bad","start_date":"2026-12-01","end_date":"2026-11-01"}')
echo "$R" | grep -q '"error"' && ck "a term ending before it starts is rejected" 1 || ck "reversed range rejected" 0 "$R"

R=$(curl -s -b $J -X POST $API/api/terms -H 'Content-Type: application/json' \
  -d '{"name":"Forever","start_date":"2026-01-01","end_date":"2030-01-01"}')
echo "$R" | grep -q '"error"' && ck "an implausibly long term is rejected" 1 || ck "long term rejected" 0 "$R"

R=$(curl -s -b $J -X POST $API/api/terms -H 'Content-Type: application/json' \
  -d '{"name":"Overlap","start_date":"2026-11-01","end_date":"2026-12-20"}')
echo "$R" | grep -q 'overlaps' && ck "overlapping terms are refused (a date must belong to ONE term)" 1 || ck "overlap refused" 0 "$R"

R=$(curl -s -b $J -X POST $API/api/terms -H 'Content-Type: application/json' \
  -d '{"name":"Hilary 2027","start_date":"2027-01-12","end_date":"2027-03-19"}')
echo "$R" | grep -q '"name":"Hilary 2027"' && ck "a non-overlapping second term is fine" 1 || ck "second term" 0 "$R"

R=$(curl -s -b $J -X PUT $API/api/terms/$TID -H 'Content-Type: application/json' \
  -d '{"name":"Michaelmas","start_date":"2026-10-05","end_date":"2026-12-12"}')
echo "$R" | grep -q '"end_date":"2026-12-12"' && ck "editing a term works" 1 || ck "edit term" 0 "$R"

echo
echo "=== disbursements ==="
R=$(curl -s -b $J -X POST $API/api/disbursements -H 'Content-Type: application/json' \
  -d '{"label":"Spring aid","amount":7000,"expected_on":"2027-01-20"}')
DID=$(echo "$R" | sed 's/.*"id":"\([^"]*\)".*/\1/')
echo "$R" | grep -q '"amount":7000' && ck "creates an expected payment" 1 || ck "create disbursement" 0 "$R"
echo "$R" | grep -q '"received_on":null' && ck "starts un-received" 1 || ck "starts un-received" 0 "$R"

R=$(curl -s -b $J -X POST $API/api/disbursements -H 'Content-Type: application/json' \
  -d '{"label":"Bad","amount":-100,"expected_on":"2027-01-20"}')
echo "$R" | grep -q '"error"' && ck "a negative amount is rejected" 1 || ck "negative rejected" 0 "$R"

R=$(curl -s -b $J -X PUT $API/api/disbursements/$DID -H 'Content-Type: application/json' \
  -d '{"received_on":"2027-01-21"}')
echo "$R" | grep -q '"received_on":"2027-01-21"' && ck "marking one received works" 1 || ck "mark received" 0 "$R"
echo "$R" | grep -q '"amount":7000' && ck "a partial update preserves other fields" 1 || ck "partial update" 0 "$R"

echo
echo "=== isolation ==="
K=/tmp/cal2.txt; rm -f $K
curl -s -c $K -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"other$(date +%s)@test.local\",\"password\":\"testpassword123\"}" >/dev/null
R=$(curl -s -b $K $API/api/terms)
echo "$R" | grep -q '"terms":\[\]' && ck "another user sees none of these terms" 1 || ck "term isolation" 0 "$R"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b $K -X DELETE $API/api/terms/$TID)
[ "$CODE" = "404" ] && ck "cannot delete another user's term" 1 || ck "cross-user delete blocked" 0 "http $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b $K -X PUT $API/api/disbursements/$DID -H 'Content-Type: application/json' -d '{"amount":1}')
[ "$CODE" = "404" ] && ck "cannot edit another user's payment" 1 || ck "cross-user edit blocked" 0 "http $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' $API/api/terms)
[ "$CODE" = "401" ] && ck "unauthenticated access refused" 1 || ck "auth required" 0 "http $CODE"

echo
echo "=== deleting the account takes the calendar with it ==="
curl -s -b $J -X DELETE $API/auth/me >/dev/null
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b $J $API/api/terms)
[ "$CODE" = "401" ] && ck "session dies with the account" 1 || ck "session dies" 0 "http $CODE"

echo; echo "  PASSED: $pass   FAILED: $fail"
[ "$fail" = "0" ] || exit 1
