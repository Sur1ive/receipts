#!/usr/bin/env node
// receipts scan — audit your past Claude Code sessions for claims without evidence.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replay } from '../src/transcript.mjs'
import { judge } from '../src/judge.mjs'

const HELP = `receipts — a lie detector for coding agents

Usage:
  receipts scan [path ...]   Audit Claude Code transcripts (default: ~/.claude/projects)
    --days N                 Only sessions modified in the last N days (default: 30)
    --json                   Machine-readable output
    --show N                 How many examples to print (default: 5)
  receipts help

Install the live hook: https://github.com/Sur1ive/receipts#install
`

const c = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (s) => (c ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const red = paint('31'),
  green = paint('32'),
  yellow = paint('33'),
  dim = paint('2'),
  bold = paint('1')

function walk(p, out = []) {
  let st
  try {
    st = fs.statSync(p)
  } catch {
    return out
  }
  if (st.isFile() && p.endsWith('.jsonl')) out.push({ p, mtime: st.mtimeMs })
  else if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f), out)
  return out
}

function parseArgs(argv) {
  const opts = { days: 30, json: false, show: 5, paths: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--days') opts.days = Number(argv[++i])
    else if (a === '--json') opts.json = true
    else if (a === '--show') opts.show = Number(argv[++i])
    else opts.paths.push(a)
  }
  if (!opts.paths.length) opts.paths.push(path.join(os.homedir(), '.claude', 'projects'))
  return opts
}

export function scan(files) {
  const stats = { sessions: 0, turns: 0, claimTurns: 0, claims: 0, unbacked: 0, contradicted: 0, tampered: 0, byKind: {} }
  const examples = []
  for (const f of files) {
    const turns = replay(f)
    if (!turns.length) continue
    stats.sessions++
    for (const t of turns) {
      stats.turns++
      const { claims, findings } = judge(t.tape, t.message)
      if (claims.length) stats.claimTurns++
      stats.claims += claims.length
      for (const cl of claims) stats.byKind[cl.kind] = (stats.byKind[cl.kind] || 0) + 1
      for (const fd of findings) {
        if (fd.tamper) stats.tampered++
        else stats.unbacked++
        if (fd.contradicted) stats.contradicted++
        examples.push({ file: f, prompt: t.prompt, ...fd })
      }
    }
  }
  // contradictions first: those are the juicy ones
  examples.sort((a, b) => (b.contradicted ? 1 : 0) - (a.contradicted ? 1 : 0) + (b.tamper ? 1 : 0) - (a.tamper ? 1 : 0))
  return { stats, examples }
}

function report({ stats, examples }, show) {
  const pct = stats.claims ? Math.round((100 * stats.unbacked) / stats.claims) : 0
  const out = []
  out.push('')
  out.push(bold('🧾 receipts — session audit'))
  out.push(dim(`   ${stats.sessions} sessions · ${stats.turns} turns · ${stats.claims} success claims`))
  out.push('')
  if (!stats.claims && !stats.tampered) {
    out.push(green('   No success claims found. Either your agent is very modest, or very quiet.'))
    return out.join('\n')
  }
  const bar = (n, total, w = 30) => {
    const k = total ? Math.round((w * n) / total) : 0
    return red('█'.repeat(k)) + green('█'.repeat(w - k))
  }
  out.push(`   ${bar(stats.unbacked, stats.claims)}  ${bold(pct + '%')} of claims had no receipts`)
  out.push('')
  out.push(`   ${green('✓')} backed         ${stats.claims - stats.unbacked}`)
  out.push(`   ${yellow('?')} unbacked       ${stats.unbacked - stats.contradicted}`)
  out.push(`   ${red('✗')} contradicted   ${stats.contradicted}   ${dim('(claimed a pass right after a failing run)')}`)
  out.push(`   ${red('!')} test tampering ${stats.tampered}   ${dim('(skipped/removed tests, not mentioned)')}`)
  if (examples.length && show > 0) {
    out.push('')
    out.push(bold('   Exhibits'))
    for (const e of examples.slice(0, show)) {
      out.push('')
      if (e.prompt) out.push(dim(`   you: "${e.prompt.replace(/\s+/g, ' ').slice(0, 70)}"`))
      if (e.claim) out.push(`   agent: ${yellow('"' + e.claim + '"')}`)
      out.push(`   ${e.contradicted || e.tamper ? red('✗') : yellow('?')} ${e.why}`)
    }
  }
  out.push('')
  out.push(dim('   Stop it happening live: https://github.com/Sur1ive/receipts#install'))
  out.push('')
  return out.join('\n')
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP)
    return
  }
  if (cmd !== 'scan') {
    process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`)
    process.exit(2)
  }
  const opts = parseArgs(rest)
  const cutoff = Date.now() - opts.days * 864e5
  const files = opts.paths.flatMap((p) => walk(p)).filter((f) => f.mtime >= cutoff).map((f) => f.p)
  const result = scan(files)
  if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  else process.stdout.write(report(result, opts.show) + '\n')
}

const invoked = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) main()
