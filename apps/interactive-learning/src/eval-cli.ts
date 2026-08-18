#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  OFFLINE_REFERENCE_CANDIDATES,
  OFFLINE_TRAJECTORY_CANDIDATES,
  gradeTeachingSuite,
  gradeTeachingTrajectorySuite,
  type TeachingEvalCandidate,
  type TeachingTrajectoryCandidate,
} from './eval.ts'

interface EvalInput {
  teaching: readonly TeachingEvalCandidate[]
  trajectories: readonly TeachingTrajectoryCandidate[]
  fixture: boolean
}

function classify(values: readonly unknown[]): Omit<EvalInput, 'fixture'> {
  const teaching: TeachingEvalCandidate[] = []
  const trajectories: TeachingTrajectoryCandidate[] = []
  for (const value of values) {
    if (typeof value === 'object' && value !== null && Array.isArray((value as { turns?: unknown }).turns)) {
      trajectories.push(value as TeachingTrajectoryCandidate)
    } else teaching.push(value as TeachingEvalCandidate)
  }
  return { teaching, trajectories }
}

async function candidatesFrom(path: string | undefined): Promise<EvalInput> {
  if (path === undefined) return {
    teaching: OFFLINE_REFERENCE_CANDIDATES,
    trajectories: OFFLINE_TRAJECTORY_CANDIDATES,
    fixture: true,
  }
  const text = await readFile(path, 'utf8')
  const parsed = text.trimStart().startsWith('[')
    ? JSON.parse(text) as unknown[]
    : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as unknown)
  return { ...classify(parsed), fixture: false }
}

const input = process.argv[2]
const candidates = await candidatesFrom(input)
const verdicts = [
  ...(candidates.teaching.length === 0 ? [] : gradeTeachingSuite(candidates.teaching)),
  ...(candidates.trajectories.length === 0 ? [] : gradeTeachingTrajectorySuite(candidates.trajectories)),
]
for (const verdict of verdicts) {
  // A file path proves only that an external grader input was supplied. It is
  // deliberately not labelled CAPTURE: provenance must come from the runner
  // that retained the raw model transcript/events (for example model-canary).
  process.stdout.write(`${candidates.fixture ? 'FIXTURE' : 'EXTERNAL_INPUT'} ${verdict.passed ? 'PASS' : 'FAIL'} ${verdict.caseId}\n`)
  for (const check of verdict.checks.filter(item => !item.passed)) {
    process.stdout.write(`  - ${check.name}: ${check.detail}\n`)
  }
}
if (verdicts.some(verdict => !verdict.passed)) process.exitCode = 1
