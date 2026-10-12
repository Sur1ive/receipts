#!/usr/bin/env node
// Single entry point for every Claude Code hook event receipts listens to.
// Fails open: if anything here breaks, the agent carries on as if we weren't installed.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { entriesFor, append, read, prune } from './tape.mjs'
import { judge, blockReason, userWarning } from './judge.mjs'
import { lastAssistantText } from './transcript.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODE = (process.env.RECEIPTS_MODE || 'strict').toLowerCase() // strict | warn | off
const MAX_BLOCKS = Number(process.env.RECEIPTS_MAX_BLOCKS || 2)

const emit = (obj) => process.stdout.write(JSON.stringify(obj))

function outputOf(ev) {
  if (ev.error) return String(ev.error)
  const r = ev.tool_response
  if (r == null) return ''
  if (typeof r === 'string') return r
  if (r.stdout != null || r.stderr != null) return `${r.stdout || ''}\n${r.stderr || ''}`
  return JSON.stringify(r)
}

export function handle(ev) {
  const sid = ev.session_id
  switch (ev.hook_event_name) {
    case 'SessionStart': {
      prune()
      if ((process.env.RECEIPTS_RULES || '').toLowerCase() === 'off') return null // hook-only mode
      const rules = fs.readFileSync(path.join(HERE, 'rules.md'), 'utf8')
      return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: rules } }
    }

    case 'UserPromptSubmit':
      append(sid, [{ k: 'turn' }])
      return null

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const failed = ev.hook_event_name === 'PostToolUseFailure'
      const interrupted = !!(ev.tool_response && ev.tool_response.interrupted)
      append(sid, entriesFor(ev.tool_name, ev.tool_input, { ok: !failed, interrupted, output: outputOf(ev) }))
      return null
    }

    case 'Stop':
    case 'SubagentStop': {
      const message = ev.last_assistant_message ?? lastAssistantText(ev.transcript_path)
      const tape = read(sid)
      const { claims, findings } = judge(tape, message)

      if (!findings.length) {
        if (process.env.RECEIPTS_VERBOSE && claims.length) {
          return { systemMessage: `🧾 receipts: ${claims.length}/${claims.length} claims backed by evidence` }
        }
        return null
      }

      let turnStart = 0
      tape.forEach((e, i) => e.k === 'turn' && (turnStart = i))
      const blocked = tape.slice(turnStart).filter((e) => e.k === 'blocked').length

      if (MODE === 'warn' || blocked >= MAX_BLOCKS) {
        return { systemMessage: userWarning(findings) }
      }
      append(sid, [{ k: 'blocked' }])
      return { decision: 'block', reason: blockReason(findings) }
    }
  }
  return null
}

async function main() {
  if (MODE === 'off') return
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const out = handle(JSON.parse(raw || '{}'))
  if (out) emit(out)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    if (process.env.RECEIPTS_DEBUG) process.stderr.write(`receipts: ${err.stack}\n`)
    process.exit(0)
  })
}
