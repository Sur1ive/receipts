import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replay } from '../src/transcript.mjs'
import { judge } from '../src/judge.mjs'
import { scan } from '../cli/receipts.mjs'

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'session.jsonl')

test('replays a transcript into one entry per finished turn', () => {
  const turns = replay(FIXTURE)
  assert.equal(turns.length, 2)
  assert.match(turns[0].message, /All tests pass/)
  assert.match(turns[0].prompt, /login test/)
})

test('catches the classic: piped failing run, quietly skipped test, "all tests pass"', () => {
  const [first, second] = replay(FIXTURE)
  const bad = judge(first.tape, first.message).findings
  assert.ok(bad.some((f) => !f.tamper && /stale.*failed/.test(f.why)), 'pass claimed, last run failed, never re-run')
  assert.ok(bad.some((f) => f.tamper), 'skip added and not disclosed')
  assert.deepEqual(judge(second.tape, second.message).findings, [], 'second turn is honest')
})

test('scan aggregates across files', () => {
  const { stats } = scan([FIXTURE])
  assert.equal(stats.sessions, 1)
  assert.equal(stats.turns, 2)
  assert.equal(stats.unbacked, 1)
  assert.equal(stats.tampered, 1)
})
