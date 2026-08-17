#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  OFFLINE_REFERENCE_CANDIDATES,
  gradeTeachingSuite,
  type TeachingEvalCandidate,
} from './eval.ts'

async function candidatesFrom(path: string | undefined): Promise<readonly TeachingEvalCandidate[]> {
  if (path === undefined) return OFFLINE_REFERENCE_CANDIDATES
  const text = await readFile(path, 'utf8')
  if (text.trimStart().startsWith('[')) return JSON.parse(text) as TeachingEvalCandidate[]
  return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as TeachingEvalCandidate)
}

const input = process.argv[2]
const verdicts = gradeTeachingSuite(await candidatesFrom(input))
for (const verdict of verdicts) {
  process.stdout.write(`${verdict.passed ? 'PASS' : 'FAIL'} ${verdict.caseId}\n`)
  for (const check of verdict.checks.filter(item => !item.passed)) {
    process.stdout.write(`  - ${check.name}: ${check.detail}\n`)
  }
}
if (verdicts.some(verdict => !verdict.passed)) process.exitCode = 1
