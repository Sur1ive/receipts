<p align="center">
  <img src="assets/logo.svg" width="120" alt="receipts">
</p>

<h1 align="center">receipts</h1>

<p align="center">
  <strong>拿不出证据，就别打 ✅</strong><br>
  给 AI 编程助手装一台测谎仪。只要它没有在最后一次改代码<em>之后</em>真的跑过测试、并且测试真的通过，它就不能说"所有测试都通过了"。
</p>

<p align="center">
  <a href="https://github.com/Sur1ive/receipts/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Sur1ive/receipts/ci.yml?branch=main&style=flat-square&label=tests" alt="tests"></a>
  <img src="https://img.shields.io/badge/依赖-0-1A7F37?style=flat-square" alt="零依赖">
  <img src="https://img.shields.io/badge/Claude%20Code-hook%20%2B%20skill-D97757?style=flat-square" alt="Claude Code">
  <img src="https://img.shields.io/badge/Codex%20·%20Cursor%20·%20Copilot%20·%20Gemini-规则-555?style=flat-square" alt="其他 agent">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-555?style=flat-square" alt="MIT"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

<p align="center">
  <img src="assets/demo.svg" width="860" alt="Agent 只跑了一个测试文件就说 'Fixed — all tests pass ✅'，receipts hook 把它打回：改动后只跑了部分测试，完整测试套件没有重跑。Agent 随后运行 npm test，发现失败，并更正了回答。">
  <br><sub>一次真实的 Claude Code 会话（有删节）。这次只开了 hook、没注入规则提示，全靠 hook 自己拦下这句话。<a href="docs/real-sessions.md">完整记录 →</a></sub>
</p>

---

## 这些场景你一定见过

| Agent 说 | 实际上 |
|---|---|
| "所有测试都通过了 ✅" | 它根本没跑。 |
| "所有测试都通过了 ✅" | 跑了，挂了 3 个。但它用了 `\| tail -20`，退出码变成了 0。 |
| "所有测试都通过了 ✅" | 它给唯一没过的那个测试加了 `.skip`。 |
| "所有测试都通过了 ✅" | 它只跑了**一个**测试文件，完整测试套件是红的。 |
| "编译成功。" | 确实成功过，在四次修改之前。 |
| "现在应该可以正常工作了。" | 改了代码，什么都没运行。 |

这些都不是故意撒谎。Agent 预测"活儿干完了"，然后把预测写成了陈述句。**receipts** 在这个预测和你之间加了一道核查。

## 工作原理

```
 每次工具调用                              Agent 准备结束时
 ────────────                              ────────────────
 PostToolUse ──► 记录带（tape）            Stop ──► 裁判（judge）
   $ npm test        exit 1  "2 failed"       读取最终回复
   ✎ src/auth.ts     代码修改                 找出声明（"all tests pass"、"已修复"、"构建成功"）
   ✎ auth.test.ts    + it.skip(  ⚠            逐条对照记录带
   $ npx tsc         exit 0                   ├─ 有证据   → 正常结束
                                              └─ 没证据   → 拦下，并说明具体原因
```

1. **记录带。** Hook 会记下每条 shell 命令（真实退出码，并扫描输出里的失败行）和每次文件修改。全部在本地完成，不占上下文。
2. **裁判。** Agent 结束时，检查它最终回复里的"成功声明"（支持中文和英文）。每条声明都需要证据：

| 声明 | 需要的证据 |
|---|---|
| 测试通过 / 测试全绿 / 42 passed | 最后一次改代码之后跑过的每条测试命令，最终结果都是通过。说"**所有**测试通过"还必须跑过完整套件，只跑一个文件或加了 `-k` 过滤的不算 |
| 构建成功 / 编译通过 / 类型检查通过 | 最后一次改代码之后跑过构建或类型检查（`cargo test` 通过也算） |
| lint 通过 | 最后一次改代码之后跑过 lint |
| 已修复 / 现在正常了 / 应该可以了 | 最后一次改代码之后至少*执行过一些东西*：测试、构建、复现脚本、curl…… |
| *（无需声明）* | 本轮跳过、删除测试或删掉断言，必须在回复里**说出来** |

3. **判决。** 没有证据的声明会阻止 Agent 结束，并把原因精确地反馈给它，比如 *"the last tests run FAILED: `npm test` → `Tests: 1 failed`"*，或 *"stale evidence：src/auth.ts 在最后一次测试之后被改过"*。Agent 要么去把检查跑一遍，要么把声明改成 `UNVERIFIED`。每轮最多打回两次，之后放行，并转而提醒**你**。

4. **规则。** 一段约 220 token 的短提示，教 Agent 主动附上证据，没验证的就写 `UNVERIFIED`。规则开着时，大部分声明都会自带收据，hook 很少需要出手：

```
Receipts
✓ tests      npm test → 42 passed, 0 failed
✓ typecheck  tsc --noEmit → exit 0
? manual     UNVERIFIED: 打开 /login 提交一次表单
```

如实说明没验证，永远可以通过。**receipts 从不要求 Agent 把所有检查都跑一遍，只要求它别声称自己没跑过的东西。**

## 安装

### Claude Code（hook + skills）

```
/plugin marketplace add Sur1ive/receipts
/plugin install agent-receipts@receipts
```

重启会话即可。需要 PATH 里有 `node` ≥ 18。零依赖，数据不离开你的电脑。

同时附带两个 skill：

- **`/agent-receipts:receipts-audit`**：交叉质询。Agent 列出本次会话里自己做过的每一条声明，在当前代码上重新跑一遍对应的检查，再用 `git diff` 看测试文件有没有被动过手脚，最后给出 ✓ 成立 / ✗ 被推翻 / ! 篡改。提交代码前用一下。
- **`/agent-receipts:receipts`**：完整的证据规则，Agent 汇报结果时自动加载。

### Codex、Cursor、Copilot、Gemini CLI、OpenCode、Windsurf、Aider……

把 [`AGENTS.md`](AGENTS.md) 复制到项目的规则文件里（`AGENTS.md`、`.cursor/rules/receipts.md`、`.github/copilot-instructions.md`、`GEMINI.md`、`CONVENTIONS.md` 等），如果你的 agent 支持 skill，也可以把 [`skills/receipts`](skills/receipts/SKILL.md) 装成 skill。这样能得到规则和收据块；强制执行的 hook 目前只支持 Claude Code，欢迎为其他 agent 的 hook 系统贡献适配器（见 [CONTRIBUTING.md](CONTRIBUTING.md)）。

## 审计你的历史记录

你的 Agent 有多少次在没有证据的情况下宣布成功？用 Claude Code 已经保存的会话记录查一下：

```bash
npx github:Sur1ive/receipts scan            # 最近 30 天的 ~/.claude/projects
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

只读、离线。加 `--json` 输出机器可读格式。

## 配置

都是可选的环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `RECEIPTS_MODE` | `strict` | `strict` 拦截无证据声明 · `warn` 只提醒你 · `off` 全部关闭 |
| `RECEIPTS_RULES` | `on` | `off` = 仅 hook 模式：不向上下文注入提示，但 hook 照常判定 |
| `RECEIPTS_MAX_BLOCKS` | `2` | 每轮最多打回几次，之后放行并提醒你 |
| `RECEIPTS_VERBOSE` | | 设为 `1`，所有声明都有证据时也显示一行提示 |

## 常见问题

**模型自己不就会这么做吗？**
很多时候会。前沿模型比以前谨慎得多，开着规则时基本用不上 hook。在我们自己的测试里，Agent 刚看到 `npm test` 失败，就*拒绝*了用户"最后说一句所有测试都通过"的要求。但"很多时候"不是可以依赖的性质。长会话、上下文压缩、更便宜的模型、用户一句*"你就告诉我能用就行"*，hook 都不在乎，它只看记录带。

**会不会误报？**
裁判只标记*肯定语气*的成功声明。否定句、条件句、问句、给你的指令（"运行 `npm test` 确认所有测试都通过"），以及代码块里的内容，都会被忽略。只要写了 `UNVERIFIED` 或"我还没运行"，一律放行。最坏情况是被打回两次，改一句话就能解决。遇到误报请[提 issue](https://github.com/Sur1ive/receipts/issues/new?template=false-positive.yml)并附上那句话，每个反馈都会变成一个测试用例。

**Agent 能绕过吗？**
它可以换个说法躲开匹配规则，规则也明确告诉它不要这么做。更重要的是，记录带让那些最常见、最无聊的谎话没法再说：用 `| tail` 藏起来的退出码、过期的绿灯、拿一个文件冒充"全部"、悄悄加上的 `.skip`。这些占了绝大多数。

**会拖慢速度吗？**
每个 hook 是一个约 40 ms 的本地 node 进程，规则提示约 220 token。只有声明确实缺证据时才会拦截。

**会上传数据吗？**
不会。没有网络请求，没有遥测。记录带是插件数据目录下的一个 JSONL 文件，7 天后自动清理。

**支持哪些测试工具？**
npm/pnpm/yarn/bun test、jest、vitest、mocha、playwright、pytest、unittest、tox、go test、cargo test/nextest、gradle、maven、dotnet、swift、deno、mix、rspec、phpunit、ctest、`node --test`、`make test`……以及 tsc、mypy、pyright、cargo check/build、go build/vet、eslint、ruff、clippy、golangci-lint 等。见 [`src/classify.mjs`](src/classify.mjs)。缺了你用的？一行就能加上，欢迎 PR。

## 参与贡献

最有价值的贡献是：**它漏掉的谎话**，或者**它误拦的真话**。把那句话和当时实际运行了什么贴进 issue，它就会变成一个测试用例。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
git clone https://github.com/Sur1ive/receipts && cd receipts
npm test          # node --test，零依赖
```

## 许可证

[MIT](LICENSE)

<p align="center"><sub>如果 receipts 帮你拦下过一个会让你白忙一下午的 ✅，点个 ⭐ 能让更多人找到它。</sub></p>
