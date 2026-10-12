// Read Claude Code session transcripts (~/.claude/projects/**/*.jsonl)
// and replay them into tape entries, turn by turn.

import fs from 'node:fs'
import { entriesFor } from './tape.mjs'

function lines(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
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

const blocks = (m) => {
  const c = m && m.message && m.message.content
  if (typeof c === 'string') return [{ type: 'text', text: c }]
  return Array.isArray(c) ? c : []
}

const resultText = (b) => {
  if (typeof b.content === 'string') return b.content
  if (Array.isArray(b.content)) return b.content.map((x) => x.text || '').join('\n')
  return ''
}

/** A real human prompt, not a tool result, a meta line or a local command echo. */
function isHumanPrompt(m) {
  if (m.type !== 'user' || m.isMeta || m.isSidechain) return false
  const bs = blocks(m)
  if (!bs.length || bs.some((b) => b.type === 'tool_result')) return false
  const text = bs.map((b) => b.text || '').join('')
  return !/^\s*<(command-|local-command|bash-|system-reminder|task-notification)/.test(text)
}

/**
 * Replay a transcript.
 * @returns {{tape: object[], message: string, prompt: string}[]} one item per finished turn:
 *   the tape as it stood when the agent stopped, and the agent's final text.
 */
export function replay(file) {
  const tape = []
  const turns = []
  const pending = new Map() // tool_use_id -> {name, input}
  let finalText = []
  let prompt = ''
  let open = false

  const close = () => {
    if (open && finalText.length) turns.push({ tape: tape.slice(), message: finalText.join('\n'), prompt })
    finalText = []
  }

  for (const m of lines(file)) {
    if (m.isSidechain) continue
    // a Stop hook sent the agent back: what it said up to here was one attempt to finish
    if (m.type === 'user' && /^\s*Stop hook feedback/.test(blocks(m).map((b) => b.text || '').join(''))) {
      close()
      continue
    }
    if (isHumanPrompt(m)) {
      close()
      open = true
      prompt = blocks(m).map((b) => b.text || '').join('').slice(0, 120)
      tape.push({ k: 'turn' })
      continue
    }
    if (m.type === 'assistant') {
      for (const b of blocks(m)) {
        if (b.type === 'tool_use') {
          pending.set(b.id, { name: b.name, input: b.input || {} })
          finalText = [] // text before a tool call is narration, not the final answer
        } else if (b.type === 'text' && b.text) {
          finalText.push(b.text)
        }
      }
      continue
    }
    if (m.type === 'user') {
      for (const b of blocks(m)) {
        if (b.type !== 'tool_result') continue
        const call = pending.get(b.tool_use_id)
        if (!call) continue
        const tur = m.toolUseResult
        const output = tur && typeof tur === 'object' && tur.stdout != null ? `${tur.stdout}\n${tur.stderr || ''}` : resultText(b)
        tape.push(
          ...entriesFor(call.name, call.input, {
            ok: !b.is_error,
            interrupted: !!(tur && tur.interrupted),
            output,
          }),
        )
      }
    }
  }
  close()
  return turns
}

/** Fallback for old Claude Code versions without `last_assistant_message`. */
export function lastAssistantText(file) {
  if (!file) return ''
  const all = lines(file.replace(/^~/, process.env.HOME || ''))
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i]
    if (m.type !== 'assistant') continue
    const text = blocks(m)
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    if (text) return text
  }
  return ''
}
