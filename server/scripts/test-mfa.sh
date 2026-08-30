#!/bin/bash
API=${API:-http://localhost:3001}   # see test-api.sh
pass=0; fail=0
ck(){ if [ "$2" = "1" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1"; echo "        $3"; fail=$((fail+1)); fi; }
code(){ node -e "import('$PWD/lib/totp.js').then(t=>console.log(t.generate('$1')))"; }
# Waits for the next 30s time-step, then emits a code. Needed because a code is
# single-use: enrolment consumes the current step, so a login in that same step
# is correctly refused as a replay.
fresh(){ node -e "
import('$PWD/lib/totp.js').then(async t=>{
  const step=30000, wait=step-(Date.now()%step)+400;
  await new Promise(r=>setTimeout(r,wait));
  console.log(t.generate('$1'));
});"; }

J=/tmp/mfa.txt; rm -f $J
E="mfa$(date +%s)@test.local"; P="testpassword123"

echo "=== enrolment ==="
curl -s -c $J -X POST $API/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}" >/dev/null
R=$(curl -s -b $J $API/auth/mfa); echo "$R" | grep -q '"enabled":false' && ck "starts disabled" 1 || ck "starts disabled" 0 "$R"

R=$(curl -s -b $J -X POST $API/auth/mfa/totp/start -H 'Content-Type: application/json' -d '{}')
SECRET=$(echo "$R" | sed 's/.*"secret":"\([^"]*\)".*/\1/')
[ ${#SECRET} = 32 ] && ck "start returns a 32-char secret" 1 || ck "start returns a secret" 0 "$R"
echo "$R" | grep -q '"qr":"data:image/png;base64' && ck "returns an inline QR data URI" 1 || ck "returns QR" 0 "no qr"
echo "$R" | grep -q 'otpauth://totp/Centsible:' && ck "otpauth URI well-formed" 1 || ck "otpauth URI" 0 "no uri"

R=$(curl -s -b $J $API/auth/mfa); echo "$R" | grep -q '"pendingSetup":true' && ck "unconfirmed factor does NOT enable MFA" 1 || ck "unconfirmed factor" 0 "$R"

R=$(curl -s -b $J -X POST $API/auth/mfa/totp/confirm -H 'Content-Type: application/json' -d '{"token":"000000"}')
echo "$R" | grep -q '"error"' && ck "confirm rejects a wrong code" 1 || ck "confirm rejects wrong code" 0 "$R"

C=$(code "$SECRET")
R=$(curl -s -b $J -X POST $API/auth/mfa/totp/confirm -H 'Content-Type: application/json' -d "{\"token\":\"$C\"}")
echo "$R" | grep -q '"enabled":true' && ck "confirm accepts a real code" 1 || ck "confirm accepts real code" 0 "$R"
NCODES=$(echo "$R" | grep -o '"[0-9a-z]\{4\}-[0-9a-z]\{4\}"' | wc -l | tr -d ' ')
[ "$NCODES" = "10" ] && ck "returns 10 recovery codes" 1 || ck "returns 10 recovery codes" 0 "got $NCODES"
RC=$(echo "$R" | grep -o '"[0-9a-z]\{4\}-[0-9a-z]\{4\}"' | head -1 | tr -d '"')

echo
echo "=== login now requires the second factor ==="
K=/tmp/mfa2.txt; rm -f $K
R=$(curl -s -c $K -X POST $API/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}")
echo "$R" | grep -q '"mfaRequired":true' && ck "password alone returns mfaRequired" 1 || ck "password alone -> mfaRequired" 0 "$R"
grep -q access_token $K && ck "NO access_token issued yet" 0 "session handed out before MFA!" || ck "NO access_token issued yet" 1
grep -q mfa_pending $K && ck "mfa_pending cookie set" 1 || ck "mfa_pending cookie set" 0 "missing"

echo
echo "=== BYPASS ATTEMPTS ==="
PEND=$(grep mfa_pending $K | awk '{print $NF}')
CODE=$(curl -s -o /dev/null -w '%{http_code}' $API/auth/me -H "Cookie: access_token=$PEND")
[ "$CODE" = "401" ] && ck "pending token replayed as access_token -> 401" 1 || ck "pending token as access_token" 0 "http $CODE — MFA BYPASS"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b $K $API/auth/me)
[ "$CODE" = "401" ] && ck "protected route unreachable mid-challenge" 1 || ck "protected route mid-challenge" 0 "http $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d '{"token":"123456"}')
[ "$CODE" = "401" ] && ck "verify without pending cookie -> 401" 1 || ck "verify without cookie" 0 "http $CODE"

echo
echo "=== completing the challenge ==="
R=$(curl -s -b $K -c $K -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d '{"token":"000000"}')
echo "$R" | grep -q '"error"' && ck "wrong code rejected" 1 || ck "wrong code rejected" 0 "$R"
# Re-using the enrolment code here is correctly refused as a replay; assert that
# specific message, then wait for a genuinely new step.
R=$(curl -s -b $K -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d "{\"token\":\"$C\"}")
echo "$R" | grep -q "already used that code" && ck "spent code gets a REPLAY message, not 'wrong code'" 1 || ck "replay message" 0 "$R"
C=$(fresh "$SECRET")
R=$(curl -s -b $K -c $K -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d "{\"token\":\"$C\"}")
echo "$R" | grep -q '"user"' && ck "correct code completes login" 1 || ck "correct code completes login" 0 "$R"
grep -q access_token $K && ck "session issued only after MFA" 1 || ck "session issued after MFA" 0 "no cookie"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b $K $API/auth/me)
[ "$CODE" = "200" ] && ck "protected route now reachable" 1 || ck "protected route reachable" 0 "http $CODE"

echo
echo "=== replay protection ==="
L=/tmp/mfa3.txt; rm -f $L
curl -s -c $L -X POST $API/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}" >/dev/null
R=$(curl -s -b $L -c $L -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d "{\"token\":\"$C\"}")
echo "$R" | grep -q '"error"' && ck "SAME code cannot be reused for a second login" 1 || ck "code replay blocked" 0 "REPLAY ACCEPTED: $R"

echo
echo "=== recovery codes ==="
M=/tmp/mfa4.txt; rm -f $M
curl -s -c $M -X POST $API/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}" >/dev/null
R=$(curl -s -b $M -c $M -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d "{\"recoveryCode\":\"$RC\"}")
echo "$R" | grep -q '"user"' && ck "recovery code completes login" 1 || ck "recovery code login" 0 "$R"
N=/tmp/mfa5.txt; rm -f $N
curl -s -c $N -X POST $API/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}" >/dev/null
R=$(curl -s -b $N -c $N -X POST $API/auth/mfa/verify -H 'Content-Type: application/json' -d "{\"recoveryCode\":\"$RC\"}")
echo "$R" | grep -q '"error"' && ck "used recovery code is single-use" 1 || ck "recovery code single-use" 0 "REUSED: $R"
R=$(curl -s -b $M $API/auth/mfa); echo "$R" | grep -q '"recoveryCodesRemaining":9' && ck "remaining count drops to 9" 1 || ck "remaining count" 0 "$R"

echo
echo "=== disable requires password ==="
R=$(curl -s -b $M -X POST $API/auth/mfa/disable -H 'Content-Type: application/json' -d '{"password":"wrongpassword"}')
echo "$R" | grep -q '"error"' && ck "disable with wrong password refused" 1 || ck "disable wrong password" 0 "$R"
R=$(curl -s -b $M -X POST $API/auth/mfa/disable -H 'Content-Type: application/json' -d "{\"password\":\"$P\"}")
echo "$R" | grep -q '"enabled":false' && ck "disable with correct password works" 1 || ck "disable correct password" 0 "$R"
R=$(curl -s -b $M $API/auth/mfa); echo "$R" | grep -q '"recoveryCodesRemaining":0' && ck "disabling burns remaining recovery codes" 1 || ck "disable burns codes" 0 "$R"
O=/tmp/mfa6.txt; rm -f $O
R=$(curl -s -c $O -X POST $API/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}")
echo "$R" | grep -q '"user"' && ck "login is single-factor again" 1 || ck "login single-factor again" 0 "$R"

echo; echo "  PASSED: $pass   FAILED: $fail"
[ "$fail" = "0" ] || exit 1
