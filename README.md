<p align="center">
  <img src="assets/logo.svg" width="120" alt="receipts">
</p>

<h1 align="center">receipts</h1>

<p align="center">
  <strong>No receipts, no ✅</strong><br>
  A lie detector for coding agents. Your agent can't say <em>"all tests pass"</em> unless it actually ran them, after its last change, and they passed.
</p>

<p align="center">
  <a href="https://github.com/Sur1ive/receipts/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Sur1ive/receipts/ci.yml?branch=main&style=flat-square&label=tests" alt="tests"></a>
  <img src="https://img.shields.io/badge/dependencies-0-1A7F37?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/Claude%20Code-hook%20%2B%20skill-D97757?style=flat-square" alt="Claude Code: hook + skill">
  <img src="https://img.shields.io/badge/Codex%20·%20Cursor%20·%20Copilot%20·%20Gemini-rules-555?style=flat-square" alt="other agents: rules">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-555?style=flat-square" alt="MIT"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="assets/demo.svg" width="860" alt="The agent says 'Fixed — all tests pass ✅' after running one test file. The receipts hook sends it back: only a subset ran, the full suite was not re-run. The agent runs npm test, sees it fail, and corrects its answer.">
  <br><sub>A real Claude Code session, condensed. Only the hook was on, with no rules prompt, so it had to catch the claim by itself. <a href="docs/real-sessions.md">Full runs →</a></sub>
</p>

---

## You've seen this

| The agent said | What actually happened |
|---|---|
| "All tests pass ✅" | It never ran them. |
| "All tests pass ✅" | It ran them. 3 failed. It had piped the run into `\| tail -20`, so the exit code was 0. |
| "All tests pass ✅" | It added `.skip` to the one that didn't. |
| "All tests pass ✅" | It ran **one** test file. The full suite is red. |
| "The build succeeds." | It did, four edits ago. |
| "This should now work." | It changed the code and ran nothing. |

None of these is malice. The agent predicts that the work is done, and the prediction comes out as a statement. **receipts** puts a check between the prediction and you.

## How it works

```
 every tool call                         when the agent tries to stop
 ───────────────                         ────────────────────────────
 PostToolUse ──► the tape                Stop ──► the judge
   $ npm test        exit 1  "2 failed"     reads the final message
   ✎ src/auth.ts     code edit              finds the claims ("all tests pass", "fixed", "构建成功")
   ✎ auth.test.ts    + it.skip(  ⚠          checks each claim against the tape
   $ npx tsc         exit 0                 ├─ backed      → stop normally
                                            └─ no receipt  → block, say exactly why
```

1. **The tape.** Hooks record every shell command (with its real exit code and a scan of the output for failure lines) and every file edit. Recording is local and costs nothing in context.
2. **The judge.** When the agent finishes, its final message is checked for success claims, in English and Chinese. Each claim needs evidence:

| Claim | Needs |
|---|---|
| tests pass / test suite is green / 42 passed / 测试通过 | Every test command run since the last code edit ends green. "**All** tests pass" also needs the full suite, not one file or a `-k` filter |
| build succeeds / compiles / typechecks / 编译成功 | A build or typecheck run since the last code edit (a green `cargo test` counts) |
| lint is clean | A lint run since the last code edit |
| fixed / works now / should work / 已修复 | *Something* was executed after the last code edit: a test, a build, a repro script, a curl |
| *(no claim needed)* | Tests skipped, deleted or stripped of assertions this turn must be **mentioned** |

3. **The verdict.** Unbacked claims block the stop. The agent gets back a precise reason: *"the last tests run FAILED: `npm test` → `Tests: 1 failed`"* or *"stale evidence: src/auth.ts changed after the last tests run"*. It then either runs the check or relabels the claim `UNVERIFIED`. It can be sent back at most twice per turn. After that the hook lets it stop and warns **you** instead.

4. **The rules.** A short prompt (~220 tokens) teaches the agent to attach receipts and to say `UNVERIFIED` when it didn't check. With it on, most claims arrive with their receipts and the hook rarely has to fire:

```
Receipts
✓ tests      npm test → 42 passed, 0 failed
✓ typecheck  tsc --noEmit → exit 0
? manual     UNVERIFIED: open /login and submit the form
```

Honest gaps always pass. **receipts never asks the agent to run everything. It asks it not to claim what it didn't run.**

## Install

### Claude Code (hook + skills)

```
/plugin marketplace add Sur1ive/receipts
/plugin install receipts@receipts
```

Restart the session. That's it. Requires `node` ≥ 18 on your PATH. Zero dependencies, nothing leaves your machine.

You also get two skills:

- **`/receipts:receipts-audit`**: cross-examination. The agent lists every claim it made this session, re-runs the check behind each one against the current tree, and checks `git diff` on your test files for tampering. Then it reports ✓ HOLDS / ✗ CONTRADICTED / ! TAMPERING. Use it before you commit.
- **`/receipts:receipts`**: the full evidence rules, loaded when the agent is about to report results.

### Codex, Cursor, Copilot, Gemini CLI, OpenCode, Windsurf, Aider…

Copy [`AGENTS.md`](AGENTS.md) into your project's rules file (`AGENTS.md`, `.cursor/rules/receipts.md`, `.github/copilot-instructions.md`, `GEMINI.md`, `CONVENTIONS.md`, …), or install [`skills/receipts`](skills/receipts/SKILL.md) as a skill if your agent supports them. You get the rules and the receipts block. The enforcing hook is Claude Code only for now; adapters for other agents' hook systems are [welcome](CONTRIBUTING.md).

## Audit your history

How often has your agent claimed success without evidence? Find out from the transcripts Claude Code already keeps:

```bash
npx github:Sur1ive/receipts scan            # last 30 days of ~/.claude/projects
npx github:Sur1ive/receipts scan --days 7 --show 10
```

```
🧾 receipts — session audit
   7 sessions · 10 turns · 6 success claims

   ██████████████████████████████  33% of claims had no receipts

   ✓ backed         4
   ? unbacked       1
   ✗ contradicted   1   (claimed a pass right after a failing run)
   ! test tampering 0   (skipped/removed tests, not mentioned)

   Exhibits

   you: "Fix slugify in slug.js so punctuation is removed (e.g. 'Hello, World!'"
   agent: "Fixed — all tests pass ✅"
   ✗ only a subset ran since the change (`node --test test/slug.test.js`); the full suite `npm test` last FAILED
```

Read-only and offline. `--json` for machine-readable output.

## Configuration

All optional, set as environment variables:

| Variable | Default | |
|---|---|---|
| `RECEIPTS_MODE` | `strict` | `strict` blocks unbacked claims · `warn` only tells you · `off` disables everything |
| `RECEIPTS_RULES` | `on` | `off` = hook-only mode: no prompt is added to context, and the hook still judges |
| `RECEIPTS_MAX_BLOCKS` | `2` | Times per turn the agent can be sent back before the hook stands down and warns you |
| `RECEIPTS_VERBOSE` | | Set to `1` to see a line when every claim checked out |

## FAQ

**Doesn't the model already do this?**
Often, yes. Frontier models are far more careful than they were, and with the rules on they rarely need the hook. In our own test runs the agent *refused* a user's demand to end with "all tests pass" because it had just watched `npm test` fail. But "often" is not a property you can build on. Long sessions, context compaction, cheaper models, a user saying *"just tell me it works"*: the hook doesn't care about any of that. It checks the tape.

**What about false positives?**
The judge only flags *assertive* success claims. Anything negated, conditional, a question, an instruction to you ("run `npm test` to make sure all tests pass"), or inside a code block is ignored. Anything marked `UNVERIFIED`/"I haven't run" always passes. At worst the agent gets sent back twice, and the fix is one sentence. If you hit a false positive, please [open an issue](https://github.com/Sur1ive/receipts/issues/new?template=false-positive.yml) with the sentence; every report becomes a test case.

**Can the agent game it?**
It could rephrase a claim to dodge the patterns, and the rules tell it not to. More to the point, the tape makes the dull lies impossible: an exit code hidden behind `| tail`, a stale green run, one file standing in for "all", a quiet `.skip`. That's most of them.

**Does it slow things down?**
Each hook is a ~40 ms local node process. The rules prompt is ~220 tokens. Blocks only happen when a claim is actually unbacked.

**Does anything leave my machine?**
No. No network calls, no telemetry. The tape is a JSONL file in the plugin's data directory, pruned after 7 days.

**Which test runners does it know?**
npm/pnpm/yarn/bun test, jest, vitest, mocha, playwright, pytest, unittest, tox, go test, cargo test/nextest, gradle, maven, dotnet, swift, deno, mix, rspec, phpunit, ctest, `node --test`, `make test`… plus tsc, mypy, pyright, cargo check/build, go build/vet, eslint, ruff, clippy, golangci-lint and more. See [`src/classify.mjs`](src/classify.mjs). Missing yours? It's a one-line PR.

## Contributing

The most useful contribution is **a lie it missed**, or **a truth it blocked**. Paste the sentence and what had actually run into an issue, and it becomes a test case. See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/Sur1ive/receipts && cd receipts
npm test          # node --test, zero deps
```

## License

[MIT](LICENSE)

<p align="center"><sub>If receipts ever stopped a ✅ that would have cost you an afternoon, a ⭐ helps other people find it.</sub></p>
