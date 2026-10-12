// The judge: given what actually happened (the tape) and what the agent
// says happened (its final message), decide which claims hold up.

import { findClaims, disclosesTampering } from './classify.mjs'

/**
 * Tape entries (one per line in the session ledger):
 *   { k: 'turn' }                                     user sent a prompt
 *   { k: 'run',  cmd, cats, ok, masked, piped, sig }  shell command finished
 *   { k: 'edit', file, code }                         file changed
 *   { k: 'tamper', what }                             tests skipped/removed/deleted
 */

const LABEL = { test: 'tests', build: 'build/typecheck', lint: 'lint' }
const ACCEPTS = { test: ['test'], build: ['build', 'test'], lint: ['lint'] }

// a claim about the whole suite …
const ALL = /\b(all|every|whole|entire|full)\b|全部|所有|整个/i
// … is not backed by a run narrowed to one file or one name filter
const TARGETED = /\S+\.(test|spec)\.\w+|\S+_test\.\w+|test_\w+\.py|::|\s-k\s|\s-t\s|--grep\b|--testNamePattern\b|\s-run\s|--test-name-pattern\b|\btest\/\S+\.\w+/

/** A run proves a pass only if it exited 0, output looks clean and nothing masked it. */
const proves = (r) => r.ok && !r.sig && !r.masked

/**
 * @param {object[]} tape
 * @param {string} message  the agent's final text for this turn
 * @returns {{claims: object[], findings: {claim: string|null, why: string}[]}}
 */
export function judge(tape, message) {
  const claims = findClaims(message)
  const findings = []

  let turnStart = 0
  let lastEdit = -1
  let lastEditFile = null
  tape.forEach((e, i) => {
    if (e.k === 'turn') turnStart = i
    if (e.k === 'edit' && e.code) {
      lastEdit = i
      lastEditFile = e.file
    }
  })

  const runs = tape.map((e, i) => ({ ...e, i })).filter((e) => e.k === 'run')

  for (const c of claims) {
    if (c.kind === 'fixed') {
      if (lastEdit < 0) continue // agent changed no code; nothing for us to check
      const verified = runs.some((r) => r.i > lastEdit && r.cats.length && proves(r))
      if (!verified) {
        findings.push({
          claim: c.text,
          why: `nothing was run after your last code change (${short(lastEditFile)}) — no test, no build, no execution`,
        })
      }
      continue
    }

    const relevant = runs.filter((r) => r.cats.some((cat) => ACCEPTS[c.kind].includes(cat)))
    const fresh = relevant.filter((r) => r.i > lastEdit)

    if (!relevant.length) {
      findings.push({ claim: c.text, why: `no ${LABEL[c.kind]} command was run in this session` })
      continue
    }
    if (!fresh.length) {
      const last = relevant[relevant.length - 1]
      findings.push({
        claim: c.text,
        why: `stale evidence — ${short(lastEditFile)} changed after the last ${LABEL[c.kind]} run${proves(last) ? '' : ' (which had failed)'}`,
      })
      continue
    }

    // A build claim may lean on a test run (it had to compile), but a red
    // test run doesn't prove the build is broken.
    let pool = fresh
    if (c.kind === 'build' && !fresh.some((r) => r.cats.includes('build'))) {
      if (!fresh.some(proves)) {
        findings.push({ claim: c.text, why: `no build/typecheck run since ${short(lastEditFile)} changed` })
      }
      continue
    }
    if (c.kind === 'build') pool = fresh.filter((r) => r.cats.includes('build'))

    // Each distinct check since the last edit must end green. A passing
    // `jest auth.test.ts` does not cancel a failing `npm test`.
    const latestByKey = new Map()
    for (const r of pool) latestByKey.set(r.key || r.cmd, r)
    const latest = [...latestByKey.values()]
    const red = latest.find((r) => !r.ok || r.sig)
    if (red) {
      findings.push({
        claim: c.text,
        why: `${LABEL[c.kind]} run FAILED and was not re-run green: \`${short(red.key || red.cmd, 60)}\`${red.sig ? ` → "${red.sig}"` : ''}`,
        contradicted: true,
      })
    } else if (latest.every((r) => r.masked)) {
      findings.push({
        claim: c.text,
        why: `the ${LABEL[c.kind]} run had its exit code masked: \`${short(latest[0].key || latest[0].cmd, 60)}\``,
      })
    } else if (c.kind === 'test' && ALL.test(c.text) && latest.every((r) => TARGETED.test(r.key || r.cmd))) {
      // "all tests pass" but only one file / one -k filter was run since the change
      const full = relevant.filter((r) => !TARGETED.test(r.key || r.cmd)).pop()
      if (full) {
        const failed = !proves(full)
        findings.push({
          claim: c.text,
          why: `only a subset ran since the change (\`${short(latest[0].key || latest[0].cmd, 50)}\`); the full suite \`${short(full.key || full.cmd, 40)}\` ${failed ? 'last FAILED' : 'was not re-run'}`,
          contradicted: failed || undefined,
        })
      }
    }
  }

  // Tampering this turn must be disclosed, claim or no claim.
  const tampering = tape.slice(turnStart).filter((e) => e.k === 'tamper')
  if (tampering.length && !disclosesTampering(message)) {
    for (const t of tampering) {
      findings.push({ claim: null, why: `you ${t.what} and did not say so`, tamper: true })
    }
  }

  return { claims, findings }
}

function short(s, n = 48) {
  s = String(s || '?').replace(/\s+/g, ' ').trim()
  if (s.includes('/') && n === 48) s = s.split('/').slice(-2).join('/')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** The message the agent sees when it gets sent back to work. */
export function blockReason(findings) {
  const lines = findings.map((f) =>
    f.claim ? `  ✗ "${f.claim}"\n      ${f.why}` : `  ✗ ${f.why}`,
  )
  return [
    `🧾 receipts: ${findings.length} claim${findings.length > 1 ? 's' : ''} without receipts.`,
    ...lines,
    '',
    'Before you finish, do ONE of these for each item:',
    '  1. Run the check now and report its real result (paste the key output line).',
    '  2. Rewrite the claim as UNVERIFIED and say what the user should run.',
    'Never skip, delete or weaken a test to get a pass. If you already did, say so plainly.',
  ].join('\n')
}

/** One-liner for the human when we let the agent stop anyway. */
export function userWarning(findings) {
  const first = findings[0]
  const more = findings.length > 1 ? ` (+${findings.length - 1} more)` : ''
  return `🧾 receipts: unbacked claim${more} — ${first.claim ? `"${first.claim}": ` : ''}${first.why}`
}
