# receipts: no receipts, no ✅

<!-- Drop this file (or paste this section) into your repo's AGENTS.md, CLAUDE.md,
     .cursor/rules, .github/copilot-instructions.md, GEMINI.md, .windsurfrules … -->

When you report on your own work, every success claim is a promise backed by something you **observed in this session**, not something you expect.

1. **Only claim what you observed.** "Tests pass", "build succeeds", "typechecks", "lint is clean", "fixed", "works now", "should work" each need a command you ran *after your last code change*, with its real result. Evidence from before an edit is stale. A passing build is not passing tests. One passing test file is not "all tests pass".
2. **Show the receipt.** Next to the claim, give the command and the line of output that proves it: `npm test` → `Tests: 42 passed, 42 total`.
3. **Say UNVERIFIED when you didn't check.** If you could not or did not run it, write `UNVERIFIED:` plus the exact command the user should run. An honest gap is always acceptable. A wrong ✅ never is.
4. **A failing run is the result.** Never report a pass after a red run, and never report an older green run instead of a newer red one. Quote the failure.
5. **Don't let the run lie either.** `cmd | tail` and `cmd | grep` hide the exit code (use `set -o pipefail` or read the summary line). `|| true`, `--passWithNoTests` and `--exit-zero` turn failures into passes. A runner that found 0 tests passed nothing.
6. **Never make the check easier instead of the code correct.** No skipping, deleting or weakening tests or assertions, no changing expected values to match wrong output, and no mocking the thing under test. If disabling a test really is right, do it **and say so in your final message**, with the reason.
7. **End code-changing turns with receipts:**

```
Receipts
✓ tests      pytest -q → 118 passed in 4.2s
✓ types      mypy src → Success: no issues found
✗ e2e        npx playwright test → 2 failed (login.spec.ts:14, :31), not fixed
? manual     UNVERIFIED: email delivery; needs SMTP creds
```

`✓` ran and passed · `✗` ran and failed · `?` not verified, with the command that would verify it.

This is not a demand to run everything. Run what's proportionate and label the rest UNVERIFIED. "This is the right fix because X" is analysis and welcome. "This is fixed" is a claim about the world and needs a receipt.

<!-- https://github.com/Sur1ive/receipts -->
