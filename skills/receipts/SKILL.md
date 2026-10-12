---
name: receipts
description: Evidence discipline for coding work. Use whenever you are about to tell the user that something passes, builds, works, is fixed, or is done — every such claim needs a receipt (the command you ran after your last change and the output that proves it), or an explicit UNVERIFIED label. Also use when finishing any task that changed code.
---

# receipts — no receipts, no ✅

You are working with someone who will act on what you tell them. When you say "all tests pass", they merge. When you say "fixed", they close the ticket. If that was a guess, you didn't save them time — you handed them a bug with your name on it.

So every success claim you make is a promise backed by something you **observed in this session**. Not something you expect. Not something that "should" be true.

## The rules

### 1. Claims need fresh evidence

These phrases are claims: *tests pass · build succeeds · compiles · typechecks · lint is clean · fixed · resolved · works now · should work · no errors · done ✅*.

Each one needs a command you ran **after your last edit to the code it is about**, whose output you actually read. Evidence from before an edit is stale. Evidence from a different command is not evidence (a passing build does not mean passing tests).

### 2. Show the receipt next to the claim

Bad: "All tests pass now."
Good: "All tests pass — `npm test` → `Tests: 42 passed, 42 total`."

Quote the line from the output that proves it. If the output was long, quote the summary line.

### 3. UNVERIFIED is an honest answer

If you didn't run it, couldn't run it (no network, no database, needs a browser, needs credentials), or ran something weaker than the claim, say so:

> UNVERIFIED: I couldn't run the integration tests (no Postgres here). Run `make test-integration` to confirm.

This is never a failure on your part. A wrong ✅ is.

### 4. A red run is the result

If the last run failed, the status is *failing*. Report the failure, quote it, and either fix it or hand it over. Don't describe a failing suite as "mostly passing" and don't report an older green run instead.

Watch for the quiet ways a run lies:
- `cmd | tail -20` and `cmd | grep ...` return the pipe's exit code, not the test runner's. Use `set -o pipefail` or read the summary line.
- `|| true`, `--passWithNoTests`, `--exit-zero` turn failures into successes.
- A test runner that found **0 tests** passed nothing.

### 5. Never make the check easier instead of the code correct

Do not, to get green:
- skip, `xit`, `.only`, `@pytest.mark.skip`, `t.Skip()`, `#[ignore]` a test
- delete a test or a test file
- remove or loosen assertions (`toEqual` → `toBeDefined`, exact → approximate)
- change the expected value to whatever the code now outputs, without checking the code is right
- mock the very thing under test
- catch and swallow the error the test was looking for

If one of these is genuinely the right call (the test is wrong, flaky, or obsolete), do it **and say so in your final message**, with the reason. Hidden, it's a lie; disclosed, it's a judgement call the user can review.

### 6. End code-changing turns with a receipts block

```
Receipts
✓ tests      pytest -q → 118 passed in 4.2s
✓ types      mypy src → Success: no issues found in 37 source files
✗ e2e        npx playwright test → 2 failed (login.spec.ts:14, :31) — not fixed, see above
? manual     UNVERIFIED: the email actually sends; needs SMTP creds
```

`✓` ran and passed · `✗` ran and failed · `?` not verified, with the command to verify.

Keep it to the checks that matter for this change. No receipts block for pure questions, explanations, or turns that changed no code.

## What this is not

- Not a demand to run everything always. Run what's proportionate; label the rest UNVERIFIED.
- Not a ban on confidence. "This is the right fix because X" is analysis, and welcome. "This is fixed" is a claim about the world, and needs a receipt.
- Not about tone. Be as brief as you like. Just be true.

## If the receipts hook sends you back

A hook may block you from finishing with a list like:

```
🧾 receipts: 1 claim without receipts.
  ✗ "All tests pass"
      stale evidence — src/auth.ts changed after the last tests run
```

Don't argue with it and don't rephrase the claim to dodge the pattern. Either run the check and report the real result, or relabel the claim UNVERIFIED. Both are one step.
