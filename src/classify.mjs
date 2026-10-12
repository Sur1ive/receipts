// Pattern tables: what counts as a check, what counts as a failure,
// what counts as a claim, and what counts as quietly cheating.
// Pure functions only, so the whole thing is trivially testable.

// ---------------------------------------------------------------- commands

const TEST_CMD = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test(:\S+)?\b/,
  /\b(npx|pnpx|bunx)\s+(jest|vitest|mocha|ava|playwright\s+test|cypress\s+run)\b/,
  /(^|[\s/])(jest|vitest|mocha|ava|pytest|py\.test|tox|nox|rspec|phpunit|pest|ctest|nextest)\b/,
  /\bpython[\d.]*\s+-m\s+(pytest|unittest|nose2?)\b/,
  /\buv\s+run\s+(pytest|python\s+-m\s+pytest)\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+(test|nextest)\b/,
  /\b(mvn|mvnw|\.\/mvnw)\b.*\b(test|verify)\b/,
  /\b(gradle|gradlew|\.\/gradlew)\b.*\b(test|check)\b/,
  /\b(dotnet|swift|deno|bun|mix|zig)\s+test\b/,
  /\bmake\s+(test|check|tests)\b/,
  /\b(rails|rake|bundle\s+exec\s+rspec)\b.*\btest\b/,
  /\bflutter\s+test\b/,
  /\bnode\s+(--test|--experimental-test-\w+)\b/,
  /\b(just|task|turbo|nx|lerna|rush|moon|bazel|bazelisk)\s+(run\s+)?[\w:@/.-]*test/,
  /\bmake\s+(ci|test-\w+|check-\w+)\b/,
]

// Output that only a test runner prints. Lets `./scripts/ci.sh` count as a test run.
const TEST_OUT =
  /\b\d+\s+(passed|passing)\b|^# pass \d+|^Tests:\s+\d+|^\s*PASS\s+\S|test result: (ok|FAILED)|^Ran \d+ tests? in|^ok\s+\S+\s+[\d.]+s$|^-+ FAIL:|^\d+ examples?, \d+ failures?/m

export const looksLikeTestOutput = (output) => TEST_OUT.test(String(output || ''))

const BUILD_CMD = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(build|typecheck|type-check|tsc|compile)\b/,
  /(^|[\s/])(tsc|vue-tsc|mypy|pyright|basedpyright|flow)\b/,
  /\b(npx|pnpx|bunx)\s+(tsc|vue-tsc|vite\s+build|next\s+build|astro\s+build|mypy|pyright)\b/,
  /\b(vite|next|astro|nuxt|webpack|rollup|esbuild|parcel)\s+build\b/,
  /\bcargo\s+(build|check)\b/,
  /\bgo\s+(build|vet)\b/,
  /\b(mvn|mvnw|\.\/mvnw)\b.*\b(compile|package|install)\b/,
  /\b(gradle|gradlew|\.\/gradlew)\b.*\b(build|assemble|compile\w*)\b/,
  /\b(dotnet|swift|zig)\s+build\b/,
  /(^|[\s;&|])make(\s+(all|build))?\s*($|[;&|])/,
  /\b(cmake\s+--build|ninja|bazel\s+build|xcodebuild)\b/,
  /\bpython[\d.]*\s+-m\s+(py_compile|compileall|mypy)\b/,
]

const LINT_CMD = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(lint|format:check|check)\b/,
  /(^|[\s/])(eslint|biome|oxlint|ruff|flake8|pylint|black\s+--check|isort\s+--check|golangci-lint|staticcheck|rubocop|shellcheck|stylelint|hadolint|ktlint|swiftlint)\b/,
  /\bprettier\b.*(--check|-c)\b/,
  /\bcargo\s+(clippy|fmt\s+--check)\b/,
  /\bgofmt\s+-l\b/,
]

// Commands that look at things but prove nothing about behaviour.
const READ_ONLY = /^(cd|ls|ll|la|cat|bat|less|more|head|tail|grep|rg|ag|find|fd|tree|pwd|echo|printf|wc|sort|uniq|cut|tr|diff|file|stat|which|type|whoami|date|env|export|set|true|false|mkdir|touch|cp|mv|rm|ln|chmod|chown|sed\s+-n|awk|jq|yq|open|code|vim|nano|git|gh|clear|history|sleep|du|df|realpath|dirname|basename)\b/

// Things that make an exit code meaningless.
const MASKED = [
  /\|\|\s*(true|:|exit\s+0)\b/,
  /;\s*(true|exit\s+0)\s*$/,
  /--passWithNoTests\b/,
  /--exit-zero\b/,
  /--no-exit-code\b/,
]

/** Split a shell line into rough segments (good enough for classification). */
export function segments(cmd) {
  return String(cmd)
    .split(/&&|\|\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Classify a shell command.
 * @returns {{cats: string[], masked: boolean, piped: boolean, key: string}}
 *   cats ⊆ ['test','build','lint','run']; 'run' = executed something that
 *   isn't purely read-only (a script, a server, curl…), i.e. weak evidence.
 */
export function classifyCommand(cmd) {
  const cats = new Set()
  const keys = []
  const text = String(cmd || '')
  for (const seg of segments(text)) {
    // first stage of a pipeline is what actually ran the check
    const head = seg
      .split(/(?<!\|)\|(?!\|)/)[0]
      .replace(/\s+\d?>>?&?\s*\S+/g, '')
      .trim()
      .replace(/^(sudo|time|env\s+\S+=\S+)\s+/, '')
    let checks = false
    if (TEST_CMD.some((r) => r.test(head))) (cats.add('test'), (checks = true))
    if (BUILD_CMD.some((r) => r.test(head))) (cats.add('build'), (checks = true))
    if (LINT_CMD.some((r) => r.test(head))) (cats.add('lint'), (checks = true))
    if (!READ_ONLY.test(head) && head.length > 0) cats.add('run')
    if (checks) keys.push(head.replace(/\s+/g, ' '))
  }
  const checked = cats.has('test') || cats.has('build') || cats.has('lint')
  const masked = checked && MASKED.some((r) => r.test(text))
  // `npm test | tail -20` reports tail's exit code unless pipefail is set
  const piped = checked && /[^|]\|[^|]/.test(text) && !/pipefail/.test(text)
  // same check run twice ⇒ same key, so a later green run supersedes an earlier red one
  return { cats: [...cats], masked, piped, key: keys.join(' && ') }
}

// ------------------------------------------------------------------ output

const FAIL_OUT = [
  /\b[1-9]\d*\s+(failed|failing|failures?)\b/i,
  /^\s*FAIL\b/m, // jest / vitest
  /^--- FAIL\b/m, // go
  /^FAIL\s+\S+/m, // go package line
  /^FAILED\b/m, // pytest short summary
  /test result: FAILED/, // cargo
  /^not ok \d+/m, // TAP
  /^# fail [1-9]/m, // node --test summary
  /\bTests? failed\b/i,
  /\bBUILD FAILED\b|\bBUILD FAILURE\b|\bBuild failed\b|\bFailed to compile\b|\bCompilation failed\b/i,
  /\berror TS\d+\b/,
  /\berror\[E\d{4}\]/, // rustc
  /\bFound [1-9]\d* errors?\b/, // tsc, ruff
  /\b[1-9]\d* problems? \(/, // eslint summary
  /^npm ERR!/m,
  /\bERR_PNPM_\w+/,
  /^error: (could not compile|test failed)/m,
]

/** Return the first failure signature found in tool output, or null. */
export function failureSignature(output) {
  const text = String(output || '')
  for (const r of FAIL_OUT) {
    const m = text.match(r)
    if (m) {
      const line = text.slice(0, m.index).split('\n').length
      const full = text.split('\n')[line - 1] || m[0]
      return full.trim().slice(0, 160)
    }
  }
  return null
}

// ------------------------------------------------------------------- files

const TEST_FILE =
  /(^|[\\/])(tests?|__tests__|spec|specs|e2e)[\\/]|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rb|exs?)$|(^|[\\/])test_[^\\/]+\.py$|Tests?\.(java|cs|kt|swift)$|_spec\.rb$/

const NON_CODE = /\.(md|mdx|txt|rst|adoc|png|jpe?g|gif|svg|ico|lock|log|csv)$|(^|[\\/])(LICENSE|CHANGELOG|README)[^\\/]*$/i

export const isTestFile = (p) => TEST_FILE.test(String(p || ''))
export const isCodeFile = (p) => !!p && !NON_CODE.test(String(p))

const SKIP_MARK =
  /\b(it|test|describe|context)\.(skip|todo)\s*\(|\bx(it|test|describe)\s*\(|@pytest\.mark\.(skip|skipif|xfail)\b|@unittest\.skip|\bpytest\.skip\s*\(|\bt\.Skip(Now|f)?\s*\(|#\[ignore\]|@Disabled\b|@Ignore\b|\[Ignore\]|\bpending\s*\(|\bskip\s*:\s*true\b/g

const ASSERT_MARK = /\b(assert\w*|expect|should\.\w+|t\.(Error|Fatal)f?|require\.\w+)\s*\(|\bassert\s/g

const count = (s, r) => (String(s || '').match(r) || []).length

/**
 * Look at one edit of a test file and report anything that makes the
 * suite easier to pass without making the code more correct.
 * @returns {string|null} human-readable description
 */
export function testTampering(file, before, after) {
  if (!isTestFile(file)) return null
  const skips = count(after, SKIP_MARK) - count(before, SKIP_MARK)
  if (skips > 0) return `added ${skips} skip/disable marker${skips > 1 ? 's' : ''} in ${file}`
  const asserts = count(before, ASSERT_MARK) - count(after, ASSERT_MARK)
  if (before && asserts > 0) return `removed ${asserts} assertion${asserts > 1 ? 's' : ''} from ${file}`
  return null
}

/** Did a shell command delete a test file? */
export function deletesTests(cmd) {
  for (const seg of segments(cmd)) {
    if (/^(git\s+)?rm\b/.test(seg) && seg.split(/\s+/).some(isTestFile)) return seg.slice(0, 120)
  }
  return null
}

// ------------------------------------------------------------------ claims

// Sentences that admit uncertainty are exactly what we want. Never flag them.
const HONEST =
  /\b(unverified|not verified|untested|not tested|not yet (run|tested|verified)|haven'?t (run|tested|verified|checked|tried)|have not (run|tested|verified|checked|tried)|didn'?t (run|test|verify|check)|did not (run|test|verify|check)|could(n'?t| not) (run|test|verify)|unable to (run|test|verify)|wasn'?t able to|without (running|testing|verifying)|can'?t (run|verify|test))\b|未验证|没有验证|没验证|未测试|没有测试|没测试|没有?跑|未运行|没有运行|无法运行|无法验证|未经验证/i

// Sentences that negate, hedge, instruct or ask aren't claims of success.
const NOT_A_CLAIM =
  /\b(not|n't|never|no longer|fail(s|ed|ing|ure)?|broken|except|if|once|unless|whether|make sure|ensure|verify that|check that|to confirm|to see|you can|you should|you'll need|need to|try|might|may|could|hopefully|expected to|let me|i'll|i will|going to|next)\b|\?|不|没|未|失败|如果|确保|请|是否|可能|需要|接下来|我来|我会/i

const CLAIMS = {
  test: [
    /\b(all|the|both|every|\d+(\/\d+)?)\s+(of the\s+)?(unit\s+|integration\s+|e2e\s+)?(tests?|specs?)(\s+suite)?\s+(are\s+|is\s+|now\s+|still\s+)*(pass(es|ed|ing)?|green|succeed(s|ed)?)\b/i,
    /\b(tests?|specs?|test suite)\s+(are\s+|is\s+|now\s+|still\s+)*(all\s+)?(pass(es|ed|ing)?|green|succeed(s|ed)?)\b/i,
    /\bpass(es|ed|ing)?\s+(all|every)\s+(the\s+)?(tests?|specs?)\b/i,
    /\b\d+\s+(tests?\s+)?passed\b/i,
    /✅\s*(all\s+)?tests?\b/i,
    /(所有|全部)?的?(单元|集成|端到端)?测试(用例)?(已经|已|均|都|全部|全)*(通过|跑通|绿了|全绿)/,
    /跑通了?(所有|全部)?的?测试/,
  ],
  build: [
    /\b(the\s+)?(build|compil(e|ation)|type\s?-?check(s|ing)?|tsc)\s+(now\s+|is\s+|are\s+|still\s+)*(succeed(s|ed)?|pass(es|ed)?|works|clean|green|successful(ly)?)\b/i,
    /\b(builds|compiles|type-?checks)\s+(now\s+)?(cleanly|successfully|fine|without (any\s+)?errors)\b/i,
    /\bzero (type|compil(e|ation)|build|ts) errors\b/i,
    /✅\s*(build|compiles|typecheck)\b/i,
    /(构建|编译|打包|类型检查)(已经|已|均|都)?(成功|通过|无报错|没有报错)/,
  ],
  lint: [
    /\b(lint(ing|er)?|eslint|ruff|clippy|flake8|biome)\s+(is\s+|are\s+|now\s+)*(clean|pass(es|ed)?|green|happy)\b/i,
    /\blint-?clean\b/i,
    /\bzero lint(ing)? (errors|warnings|issues)\b/i,
    /(lint|代码检查|静态检查)(已经|已)?(通过|无报错|干净)/i,
  ],
  fixed: [
    /\b(is|are|has been|have been|now|should be)\s+(now\s+)?(fixed|resolved)\b/i,
    /\b(works|working)\s+(now|correctly|properly|as expected|again)\b/i,
    /\bshould\s+(now\s+)?work\b/i,
    /\b(bug|issue|problem|error|crash)\s+(is\s+|has been\s+)?(fixed|resolved|gone)\b/i,
    /\bproblem solved\b/i,
    /\b(i'?ve|i have|i)\s+(now\s+)?(fixed|resolved)\b/i,
    /(已经|已)(修复|解决)|修复(了|完成)|问题(已经|已)?解决|现在(可以)?正常(工作|运行)|应该(就)?(可以|能)(正常)?(工作|运行|用)了/,
  ],
}

/** Remove fenced code, inline code and quoted output so we only judge prose. */
function prose(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, 'CODE')
    .replace(/^\s*>.*$/gm, ' ')
}

export function sentences(text) {
  return prose(text)
    .split(/(?<=[.!。！；;])\s+|\n+/)
    .map((s) => s.replace(/^[\s*\-•\d.)#]+/, '').trim())
    .filter((s) => s.length > 2)
}

/**
 * Find success claims in an assistant message.
 * @returns {{kind: 'test'|'build'|'lint'|'fixed', text: string}[]}
 */
export function findClaims(message) {
  const out = []
  const seen = new Set()
  // A receipts block is itself a set of claims, even inside a code fence:
  //   ✓ tests      npm test → 42 passed
  for (const line of String(message || '').split('\n')) {
    const m = line.match(/^\s*[✓✔✅]\s*(tests?|specs?|build|compiles?|types?|typecheck|tsc|lint)\b/i)
    if (!m) continue
    const w = m[1].toLowerCase()
    const kind = /^(tests?|specs?)$/.test(w) ? 'test' : w === 'lint' ? 'lint' : 'build'
    const text = line.trim().slice(0, 140)
    if (!seen.has(kind + text)) {
      seen.add(kind + text)
      out.push({ kind, text })
    }
  }
  for (const s of sentences(message)) {
    if (HONEST.test(s) || NOT_A_CLAIM.test(s)) continue
    for (const [kind, patterns] of Object.entries(CLAIMS)) {
      if (patterns.some((r) => r.test(s)) && !seen.has(kind + s)) {
        seen.add(kind + s)
        out.push({ kind, text: s.length > 140 ? s.slice(0, 137) + '...' : s })
      }
    }
  }
  return out
}

/** Does the message admit that tests were skipped / removed / weakened? */
export function disclosesTampering(message) {
  return /\b(skip(ped)?|disabl(ed|ing)|remov(ed|ing)|delet(ed|ing)|xfail|weaken(ed)?|comment(ed)? out|relax(ed)?|loosen(ed)?)\b[^.\n]{0,60}\b(tests?|specs?|assertions?|checks?)\b|\b(tests?|specs?|assertions?)\b[^.\n]{0,60}\b(skip(ped)?|disabled|removed|deleted|xfail|weakened|commented out|relaxed|loosened)\b|(跳过|禁用|删除|删掉|注释掉|放宽)[^。\n]{0,15}(测试|断言|用例)|(测试|断言|用例)[^。\n]{0,15}(跳过|禁用|删除|删掉|注释掉|放宽)/i.test(
    String(message || ''),
  )
}

export function isHonest(sentence) {
  return HONEST.test(sentence)
}
