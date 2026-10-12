# Contributing

receipts is small on purpose: zero dependencies, plain Node, everything in `src/`.

```
src/classify.mjs    what counts as a test/build/lint command, a failure line, a claim, tampering
src/tape.mjs        tool call → tape entries; per-session storage
src/judge.mjs       claims × tape → findings
src/hook.mjs        Claude Code hook entry point (SessionStart, UserPromptSubmit, PostToolUse(Failure), Stop)
src/transcript.mjs  replay a Claude Code transcript into tapes (used by `receipts scan`)
src/rules.md        the always-on prompt injected at session start
skills/             the receipts and receipts-audit skills
cli/receipts.mjs    `receipts scan`
```

## The best contributions

1. **A lie it missed.** Add a failing case to `test/judge.test.mjs` or `test/classify.test.mjs` with the real sentence, then make it pass.
2. **A truth it blocked.** Same, the other way round. False positives are worse than misses, because they teach people to switch the hook off.
3. **A runner it doesn't know.** One regex in `TEST_CMD` / `BUILD_CMD` / `LINT_CMD`, plus a line in the classifier test.
4. **Another language.** Claim and honesty patterns live in `CLAIMS`, `HONEST` and `NOT_A_CLAIM`. English and Chinese are in; more are welcome.
5. **Hooks for other agents.** Codex, Cursor, Gemini CLI and others have their own hook systems. An adapter only needs to turn their events into `entriesFor(...)` calls and run `judge(...)` at the end of a turn.

## Rules of thumb

- Keep it dependency-free.
- Prefer missing a lie over blocking a truth. When in doubt, don't flag it.
- Every pattern change comes with a test.

```bash
npm test
node cli/receipts.mjs scan test/fixtures --days 100000
```
