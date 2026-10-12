---
name: receipts-audit
description: Cross-examine everything you have claimed in this session. Lists each success claim you made, re-runs the check behind it now, and reports which ones still hold. Use when the user asks "did you actually test that?", "are you sure?", before a commit/PR/merge, or when they invoke /receipts-audit.
argument-hint: "[scope, e.g. 'since last commit' or 'the auth change']"
---

# receipts-audit — cross-examination

The user wants to know which of your earlier statements are actually true **right now**. Treat your own previous messages as testimony from an unreliable witness: plausible, possibly stale, possibly wrong.

Scope: $ARGUMENTS (if empty: everything since the user's first request in this session).

## Steps

1. **List the claims.** Go back through your messages in scope. Pull out every statement that something passes, builds, works, is fixed, is safe, is backwards-compatible, has no side effects, or is done. Include claims made in summaries and commit messages. Quote each one briefly.

2. **Find the check.** For each claim, name the cheapest command that would prove or disprove it *today* (a specific test file, the build, a curl against the dev server, a grep for remaining call sites…). If no command can check it, say what would.

3. **Re-run, don't recall.** Run the checks now, against the current working tree. Do not reuse output from earlier in the session — the code may have changed since. Prefer narrow, fast checks first; run the full suite once at the end if it's reasonably quick.

4. **Inspect for tampering.** Run `git diff` (and `git diff --staged`) over the test files you touched. Report any test you skipped, deleted, or weakened, and any expected value you changed — with the reason, or "no good reason" if there wasn't one.

5. **Report the verdicts** as a table, worst first:

```
Cross-examination — 6 claims

✗ CONTRADICTED  "the migration is idempotent"
                 ran it twice → duplicate key error on users_email_idx
✗ CONTRADICTED  "all tests pass"
                 npm test → 2 failed (session.test.ts:88, :102)
? UNVERIFIABLE  "emails send correctly" — needs SMTP; run `make smoke-email`
✓ HOLDS         "build succeeds" — npm run build → exit 0
✓ HOLDS         "no other callers of parseDate" — rg 'parseDate\(' → 1 hit (the definition)
! TAMPERING     skipped `refreshes expired token` in auth.test.ts — I did this; it was failing and I hadn't fixed it
```

6. **Fix or hand over.** For each ✗ or !, either fix it now (and re-run), or state plainly what's broken and what the user needs to do. Do not soften the verdicts.

Be brief. The table is the deliverable.
