// End to end: feed the real hook script the same JSON Claude Code would.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hook.mjs')

function session(env = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-test-'))
  const sid = 'sess-' + Math.random().toString(36).slice(2)
  const send = (ev) => {
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ session_id: sid, ...ev }),
      env: { ...process.env, RECEIPTS_DATA: data, RECEIPTS_MODE: '', ...env },
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout ? JSON.parse(r.stdout) : null
  }
  return {
    prompt: () => send({ hook_event_name: 'UserPromptSubmit', prompt: 'fix it' }),
    edit: (file) =>
      send({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: 'a', new_string: 'b' }, tool_response: {} }),
    bash: (command, stdout = '', ok = true) =>
      ok
        ? send({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout, stderr: '', interrupted: false } })
        : send({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command }, error: `Exit code 1\n${stdout}` }),
    stop: (msg, active = false) => send({ hook_event_name: 'Stop', last_assistant_message: msg, stop_hook_active: active }),
    start: () => send({ hook_event_name: 'SessionStart', source: 'startup' }),
  }
}

test('session start injects the rules', () => {
  const out = session().start()
  assert.match(out.hookSpecificOutput.additionalContext, /no receipts, no ✅/)
})

test('hook-only mode skips the rules but still judges', () => {
  const s = session({ RECEIPTS_RULES: 'off' })
  assert.equal(s.start(), null)
  s.prompt()
  s.edit('/repo/src/a.ts')
  assert.equal(s.stop('All tests pass.').decision, 'block')
})

test('lets an honest, verified turn finish silently', () => {
  const s = session()
  s.prompt()
  s.edit('/repo/src/a.ts')
  s.bash('npm test', 'Tests: 12 passed, 12 total')
  assert.equal(s.stop('Fixed. All tests pass — `npm test` → 12 passed.'), null)
})

test('blocks a claim made right after a failing run', () => {
  const s = session()
  s.prompt()
  s.edit('/repo/src/a.ts')
  s.bash('npm test', 'Tests: 1 failed, 11 passed', false)
  const out = s.stop('Done! All tests pass ✅')
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /FAILED/)
})

test('after two blocks in one turn it stops blocking and tells the human', () => {
  const s = session()
  s.prompt()
  s.edit('/repo/src/a.ts')
  assert.equal(s.stop('All tests pass.').decision, 'block')
  assert.equal(s.stop('All tests pass.', true).decision, 'block')
  const third = s.stop('All tests pass.', true)
  assert.equal(third.decision, undefined)
  assert.match(third.systemMessage, /unbacked claim/)
  // a new prompt resets the budget
  s.prompt()
  assert.equal(s.stop('All tests pass.').decision, 'block')
})

test('warn mode never blocks', () => {
  const s = session({ RECEIPTS_MODE: 'warn' })
  s.prompt()
  s.edit('/repo/src/a.ts')
  const out = s.stop('The build succeeds.')
  assert.equal(out.decision, undefined)
  assert.match(out.systemMessage, /receipts/)
})

test('off mode does nothing at all', () => {
  const s = session({ RECEIPTS_MODE: 'off' })
  assert.equal(s.start(), null)
  s.prompt()
  s.edit('/repo/src/a.ts')
  assert.equal(s.stop('All tests pass.'), null)
})

test('garbage input fails open', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: '{not json', encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})
