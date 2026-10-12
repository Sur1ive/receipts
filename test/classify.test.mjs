import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCommand, failureSignature, findClaims, testTampering, deletesTests, disclosesTampering } from '../src/classify.mjs'

const kinds = (msg) => findClaims(msg).map((c) => c.kind)

test('classifies common test, build and lint commands', () => {
  const cases = {
    'npm test': ['test'],
    'pnpm run test:unit': ['test'],
    'cd api && pytest -q tests/': ['test'],
    'python -m pytest -x': ['test'],
    'go test ./...': ['test'],
    'cargo test --all': ['test'],
    'npx vitest run': ['test'],
    './gradlew test': ['test'],
    'node --test test/*.test.js': ['test'],
    'pnpm turbo run test': ['test'],
    'just test': ['test'],
    'npx tsc --noEmit': ['build'],
    'npm run build': ['build'],
    'cargo check': ['build'],
    'go vet ./...': ['build'],
    'npx eslint src': ['lint'],
    'ruff check .': ['lint'],
    'cargo clippy -- -D warnings': ['lint'],
  }
  for (const [cmd, want] of Object.entries(cases)) {
    const { cats } = classifyCommand(cmd)
    for (const w of want) assert.ok(cats.includes(w), `${cmd} → ${cats}`)
  }
})

test('read-only commands are not evidence of anything', () => {
  for (const cmd of ['ls -la', 'cat src/a.ts', 'git diff', 'rg "foo"', 'sed -n 1,20p x.py']) {
    assert.deepEqual(classifyCommand(cmd).cats, [], cmd)
  }
  assert.ok(classifyCommand('node scripts/repro.js').cats.includes('run'))
  assert.ok(classifyCommand('curl -s localhost:3000/health').cats.includes('run'))
})

test('detects masked and piped exit codes', () => {
  assert.equal(classifyCommand('npm test || true').masked, true)
  assert.equal(classifyCommand('jest --passWithNoTests').masked, true)
  assert.equal(classifyCommand('npm test').masked, false)
  assert.equal(classifyCommand('npm test 2>&1 | tail -20').piped, true)
  assert.equal(classifyCommand('set -o pipefail; npm test | tail').piped, false)
})

test('finds failure signatures in output', () => {
  assert.match(failureSignature('Tests:       2 failed, 40 passed, 42 total'), /2 failed/)
  assert.match(failureSignature('==== 1 failed, 9 passed in 0.31s ===='), /1 failed/)
  assert.match(failureSignature('--- FAIL: TestParse (0.00s)'), /FAIL/)
  assert.match(failureSignature('test result: FAILED. 3 passed; 1 failed'), /FAILED/)
  assert.match(failureSignature("src/a.ts(3,5): error TS2322: Type 'string'"), /TS2322/)
  assert.match(failureSignature('# tests 4\n# pass 3\n# fail 1'), /# fail 1/)
  assert.equal(failureSignature('# tests 4\n# pass 4\n# fail 0'), null)
  assert.equal(failureSignature('Tests: 42 passed, 42 total'), null)
  assert.equal(failureSignature('==== 9 passed, 0 failed in 0.31s'), null)
})

test('finds success claims in English and Chinese', () => {
  assert.deepEqual(kinds('All tests pass now.'), ['test'])
  assert.deepEqual(kinds('The test suite is green.'), ['test'])
  assert.deepEqual(kinds('42 tests passed.'), ['test'])
  assert.deepEqual(kinds('The build succeeds and lint is clean.'), ['build', 'lint'])
  assert.deepEqual(kinds('This should now work.'), ['fixed'])
  assert.deepEqual(kinds("I've fixed the race condition."), ['fixed'])
  assert.deepEqual(kinds('The bug is fixed.'), ['fixed'])
  assert.deepEqual(kinds('所有测试都通过了。'), ['test'])
  assert.deepEqual(kinds('编译成功。'), ['build'])
  assert.deepEqual(kinds('问题已经解决。'), ['fixed'])
})

test('reads a receipts block as claims, even inside a fence', () => {
  const msg = 'Done.\n\n```\nReceipts\n✓ tests      npm test → 42 passed\n✓ typecheck  tsc → exit 0\n? manual     UNVERIFIED\n```'
  assert.deepEqual(kinds(msg), ['test', 'build'])
})

test('does not flag honest, negated, conditional or instructional sentences', () => {
  for (const msg of [
    'UNVERIFIED: tests should pass but I could not run them.',
    "I haven't run the tests yet.",
    'The tests are not passing yet.',
    'Two tests still fail.',
    'Run `npm test` to make sure all tests pass.',
    'Once you restart the server it should work.',
    'Do all tests pass on your machine?',
    'If the build succeeds, deploy it.',
    '测试还没有通过。',
    '如果测试通过，就可以合并。',
    'Here is the code:\n```\n// all tests pass\n```',
  ]) {
    assert.deepEqual(kinds(msg), [], msg)
  }
})

test('detects test tampering', () => {
  assert.match(testTampering('src/auth.test.ts', "it('works', () => {", "it.skip('works', () => {"), /skip/)
  assert.match(testTampering('tests/test_api.py', 'def test_x():', '@pytest.mark.skip\ndef test_x():'), /skip/)
  assert.match(testTampering('pkg/parse_test.go', 'func TestX(t *testing.T) {', 'func TestX(t *testing.T) {\n\tt.Skip()'), /skip/)
  assert.match(
    testTampering('src/a.spec.js', 'expect(a).toBe(1)\nexpect(b).toBe(2)', 'expect(a).toBe(1)'),
    /removed 1 assertion/,
  )
  assert.equal(testTampering('src/auth.ts', 'x', 'it.skip('), null, 'not a test file')
  assert.equal(testTampering('src/a.test.ts', 'expect(a).toBe(1)', 'expect(a).toBe(2)'), null)
  assert.ok(deletesTests('rm tests/test_flaky.py'))
  assert.equal(deletesTests('rm -rf dist'), null)
})

test('recognises disclosure of skipped tests', () => {
  assert.ok(disclosesTampering('Note: I skipped the flaky `refresh` test because it depends on wall-clock time.'))
  assert.ok(disclosesTampering('我跳过了一个不稳定的测试。'))
  assert.equal(disclosesTampering('All good, shipped.'), false)
})
