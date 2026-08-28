#!/bin/bash
# Publish-readiness check. Run from the repo root: bash scripts/preflight.sh
#
# Everything here is something that would ship broken or embarrassing rather
# than fail loudly — the class of problem you find out about from a user.
cd "$(dirname "$0")/.." || exit 1

pass=0; fail=0; warn=0
ok(){   echo "  ✓ $1"; pass=$((pass+1)); }
bad(){  echo "  ✗ $1"; [ -n "$2" ] && echo "      $2"; fail=$((fail+1)); }
note(){ echo "  ! $1"; [ -n "$2" ] && echo "      $2"; warn=$((warn+1)); }

echo "── secrets ──────────────────────────────────────────────────────────────"
if git ls-files | grep -qiE '(^|/)\.env$|\.rtf$'; then
  bad "a .env or credentials file is tracked by git" "$(git ls-files | grep -iE '(^|/)\.env$|\.rtf$' | tr '\n' ' ')"
else ok "no .env or credential files tracked by git"; fi

if git log --all --diff-filter=A --name-only --pretty=format: 2>/dev/null | grep -qiE '(^|/)\.env$'; then
  bad "a .env was committed at some point in history" "rotate those secrets; git history keeps them"
else ok "no .env in git history"; fi

echo
echo "── legal / policy ───────────────────────────────────────────────────────"
# Only bare [Bracketed] text is a real placeholder; [text](url) is a markdown
# link and must not be flagged.
PLACEHOLDERS=$(grep -oE '\[[A-Z][^]]*\][^(]' flow-privacy-policy.md 2>/dev/null | sed 's/.$//' | sort -u | tr '\n' ' ')
if [ -n "$PLACEHOLDERS" ]; then
  bad "privacy policy still has unfilled placeholders" "$PLACEHOLDERS"
else ok "privacy policy has no placeholders"; fi

if grep -q "privacy@flowapp.com" flow-privacy-policy.md 2>/dev/null; then
  note "policy lists privacy@flowapp.com — make sure that mailbox exists and is monitored"
fi

echo
echo "── frontend build config ────────────────────────────────────────────────"
if grep -q "__API_ORIGIN__" frontend/index.html 2>/dev/null; then
  ok "CSP API origin is injected at build time (not hardcoded)"
else bad "CSP no longer uses the build-time placeholder" "a hardcoded API origin will be wrong in production"; fi

if grep -q "REPLACE-WITH-YOUR-API-HOST" frontend/vercel.json 2>/dev/null; then
  bad "vercel.json proxy destination is still the placeholder" "set it to your deployed API host"
else ok "vercel.json proxy destination is set"; fi

echo
echo "── dependencies ─────────────────────────────────────────────────────────"
for d in server frontend; do
  OUT=$( (cd "$d" && npm audit --omit=dev --json 2>/dev/null) )
  N=$(echo "$OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=j.metadata?.vulnerabilities||{};console.log((v.high||0)+(v.critical||0)+(v.moderate||0))}catch{console.log('?')}})")
  if [ "$N" = "0" ]; then ok "$d: no moderate+ vulnerabilities in production deps"
  else bad "$d: $N moderate+ vulnerabilities" "run: cd $d && npm audit --omit=dev"; fi
done

echo
echo "── production behaviour ─────────────────────────────────────────────────"
if grep -q 'COOKIE_SAME_SITE' server/.env.example 2>/dev/null; then
  ok "COOKIE_SAME_SITE is documented"
else note "COOKIE_SAME_SITE not in .env.example" "set it to 'lax' if you proxy the API through the frontend origin"; fi

if grep -qE '^\s*PLAID_ENV=production' server/.env 2>/dev/null; then
  ok "PLAID_ENV=production"
else note "PLAID_ENV is not 'production'" "sandbox keys cannot connect real banks — users can still enter transactions manually"; fi

echo
echo "── tests ────────────────────────────────────────────────────────────────"
if (cd frontend && npm run build >/dev/null 2>&1); then ok "frontend builds"; else bad "frontend build FAILS"; fi
if (cd frontend && npm run smoke 2>/dev/null | grep -q "FAILED: 0"); then ok "render checks pass"; else bad "render checks FAIL"; fi
if (cd frontend && node scripts/test-runway.mjs 2>/dev/null | grep -q "FAILED: 0"); then ok "runway model passes"; else bad "runway model FAILS"; fi
if (cd frontend && node scripts/test-logic.mjs 2>/dev/null | grep -q "FAILED: 0"); then ok "frontend logic passes"; else bad "frontend logic FAILS"; fi

echo
echo "─────────────────────────────────────────────────────────────────────────"
echo "  $pass ready · $fail blocking · $warn to confirm"
[ "$fail" -eq 0 ] || echo "  Fix the ✗ items before publishing."
exit $(( fail > 0 ? 1 : 0 ))
