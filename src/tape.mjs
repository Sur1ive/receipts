// Turn tool calls into tape entries, and keep the tape on disk per session.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classifyCommand, failureSignature, isCodeFile, testTampering, deletesTests, looksLikeTestOutput } from './classify.mjs'

/**
 * @param {string} tool    tool name (Bash, Edit, Write, MultiEdit, NotebookEdit…)
 * @param {object} input   tool input
 * @param {{ok: boolean, output: string, interrupted?: boolean}} result
 * @returns {object[]} tape entries
 */
export function entriesFor(tool, input = {}, result = { ok: true, output: '' }) {
  const out = []
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command || '')
    let { cats, masked, piped, key } = classifyCommand(cmd)
    if (!cats.includes('test') && cats.includes('run') && looksLikeTestOutput(result.output)) {
      cats = [...cats, 'test'] // a wrapper script that ran a test suite
      key = key || cmd.trim()
    }
    const checked = cats.some((c) => c !== 'run')
    // when a pipe hides the exit code, the output is the only witness
    const sig = checked || !result.ok ? failureSignature(result.output) : null
    out.push({ k: 'run', cmd: cmd.slice(0, 300), key, cats, ok: !!result.ok && !result.interrupted, masked, piped, sig })
    const del = deletesTests(cmd)
    if (del) out.push({ k: 'tamper', what: `deleted test files (\`${del}\`)` })
    return out
  }

  const edits = []
  if (tool === 'Edit') edits.push([input.file_path, input.old_string, input.new_string])
  else if (tool === 'MultiEdit') for (const e of input.edits || []) edits.push([input.file_path, e.old_string, e.new_string])
  else if (tool === 'Write') edits.push([input.file_path, null, input.content])
  else if (tool === 'NotebookEdit') edits.push([input.notebook_path, null, input.new_source])
  else return out

  for (const [file, before, after] of edits) {
    if (!file) continue
    out.push({ k: 'edit', file, code: isCodeFile(file) })
    const t = testTampering(file, before, after)
    if (t) out.push({ k: 'tamper', what: t })
  }
  return out
}

// ------------------------------------------------------------ persistence

export function tapeDir() {
  const base = process.env.RECEIPTS_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'receipts')
  return path.join(base, 'tapes')
}

const safe = (id) => String(id || 'default').replace(/[^\w.-]/g, '_')

export function tapePath(sessionId) {
  return path.join(tapeDir(), `${safe(sessionId)}.jsonl`)
}

export function append(sessionId, entries) {
  if (!entries.length) return
  const file = tapePath(sessionId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, entries.map((e) => JSON.stringify({ t: Date.now(), ...e })).join('\n') + '\n')
}

export function read(sessionId) {
  try {
    return fs
      .readFileSync(tapePath(sessionId), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Delete tapes older than a week. Cheap, runs at session start. */
export function prune(maxAgeMs = 7 * 24 * 3600 * 1000) {
  try {
    const dir = tapeDir()
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      if (Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) fs.unlinkSync(p)
    }
  } catch {}
}
