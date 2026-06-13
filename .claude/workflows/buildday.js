export const meta = {
  name: 'buildday',
  description: 'Meta-orchestration harness: classify work, fan out lanes, verify, integrate, deploy',
  phases: [
    { title: 'Baseline', detail: 'Verify current main is green' },
    { title: 'Lanes', detail: 'Fan out feature work to isolated worktrees' },
    { title: 'Verify', detail: 'Run gate suite on each lane' },
    { title: 'Integrate', detail: 'Merge lanes in dependency order' },
    { title: 'Deploy', detail: 'Push to Vercel and smoke test' },
  ],
}

const GATE_COMMANDS = [
  'npm run typecheck --prefix app',
  'npm run build --prefix app',
  'npm run test --prefix app',
  'npm run selftest --prefix app',
  'npm run gate',
]

const GATE_SCRIPT = GATE_COMMANDS.join(' && ')

const LANE_SCHEMA = {
  type: 'object',
  properties: {
    lane: { type: 'string', enum: ['parse', 'render', 'edit', 'verify', 'deploy', 'docs'] },
    branch: { type: 'string' },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    gatePass: { type: 'boolean' },
  },
  required: ['lane', 'branch', 'summary', 'filesChanged', 'gatePass'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    typecheck: { type: 'boolean' },
    build: { type: 'boolean' },
    vitest: { type: 'boolean' },
    selftest: { type: 'boolean' },
    gate: { type: 'boolean' },
    bareHandleCheck: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'typecheck', 'build', 'vitest', 'selftest', 'gate', 'bareHandleCheck', 'failures'],
}

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          lane: { type: 'string', enum: ['parse', 'render', 'edit', 'verify', 'deploy', 'docs'] },
          priority: { type: 'number' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['description', 'lane', 'priority'],
      },
    },
  },
  required: ['tasks'],
}

// ── Phase 1: Baseline ──────────────────────────────────────────────────────

phase('Baseline')
log('Verifying current main is green before any work starts')

const baseline = await agent(
  `You are in the buildday-harness repo. Run the full verification gate on the current state of main:

${GATE_COMMANDS.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Then check for bare agent handles leaking into app source:
grep -rn "mythos\\|fable\\|ryo\\|cindy\\|dozy\\|codex\\|jett\\|kimi\\|charlwin" app/src/ || echo "No bare handles found"

Report whether each step passed or failed.`,
  { label: 'baseline-gate', schema: VERIFY_SCHEMA }
)

if (!baseline || !baseline.pass) {
  log('Baseline gate FAILED — fix main before starting new work')
  const failures = baseline ? baseline.failures : ['baseline check returned null']
  return { status: 'blocked', reason: 'baseline-failed', failures }
}

log('Baseline green — main is clean')

// ── Phase 2: Classify and route ────────────────────────────────────────────

phase('Lanes')

const workDescription = args?.work || 'No specific work items provided. Check open PRs and issues for pending work.'

const classified = await agent(
  `You are the build orchestrator for buildday-harness, a tactile chemistry diagram workbench.

The project has these lanes:
- parse: image upload → SMILES extraction → ChemIR (serverless proxy, Claude VLM)
- render: ChemIR → tactile SVG + braille dots + emboss-ready print sheet (mock.ts, braille.ts, braille-render.ts)
- edit: natural language → deterministic EditOp (edit-intent.ts, edit-resolve.ts)
- verify: canonical SMILES diff, fidelity report (verify.ts, rdkit-js)
- deploy: Vercel deployment, smoke test, CI
- docs: README, slides, orchestration docs, brief

Classify these work items into lanes, assign priority (1=highest), and identify dependencies:

${workDescription}

Each task should map to exactly one lane. If a task spans lanes, split it.`,
  { label: 'classify', schema: CLASSIFY_SCHEMA }
)

if (!classified || !classified.tasks || classified.tasks.length === 0) {
  log('No tasks classified — nothing to fan out')
  return { status: 'idle', baseline }
}

log(`Classified ${classified.tasks.length} tasks across ${[...new Set(classified.tasks.map(t => t.lane))].join(', ')} lanes`)

// ── Fan out: one agent per lane, worktree-isolated ─────────────────────────

const laneGroups = {}
for (const task of classified.tasks) {
  if (!laneGroups[task.lane]) laneGroups[task.lane] = []
  laneGroups[task.lane].push(task)
}

const laneResults = await parallel(
  Object.entries(laneGroups).map(([lane, tasks]) => () =>
    agent(
      `You are working on the "${lane}" lane of buildday-harness.

Your tasks (in priority order):
${tasks.map((t, i) => `${i + 1}. ${t.description}`).join('\n')}

Project structure:
- app/src/harness/contracts.ts — shared typed contracts (ChemIR, TactileSVG, EditOp, HarnessNodes interface). Do NOT modify this file unless your task explicitly requires a contract change.
- app/src/harness/mock.ts — mock node implementations
- app/src/harness/braille.ts, braille-render.ts — braille translation
- app/src/harness/edit-intent.ts, edit-resolve.ts — NL edit routing
- app/src/fixtures/chem.ts — chemistry fixtures
- api/ — serverless functions (extract-smiles proxy, edit-intent resolver)
- scripts/gate-public-artifacts.mjs — publication gate

Rules:
- Work in a feature branch named "${lane}/[descriptive-slug]"
- All changes must pass the gate: ${GATE_SCRIPT}
- Do NOT leak agent handles, channel names, or framework names into app/src/
- Commit with clear messages describing what changed and why
- If you need a contract change, document it in the commit message

After completing your tasks, run the full gate and report results.`,
      {
        label: `lane:${lane}`,
        phase: 'Lanes',
        isolation: 'worktree',
        schema: LANE_SCHEMA,
      }
    )
  )
)

const completedLanes = laneResults.filter(Boolean)
log(`${completedLanes.length}/${Object.keys(laneGroups).length} lanes completed`)

// ── Phase 3: Adversarial verification ──────────────────────────────────────

phase('Verify')

const verifyResults = await parallel(
  completedLanes.map(lane => () =>
    agent(
      `Adversarially verify the "${lane.lane}" lane result.

Branch: ${lane.branch}
Summary: ${lane.summary}
Files changed: ${lane.filesChanged.join(', ')}
Lane self-reported gate pass: ${lane.gatePass}

Your job is to find problems the lane agent missed:
1. Check out the branch and run the FULL gate:
   ${GATE_COMMANDS.map((c, i) => `   ${i + 1}. ${c}`).join('\n')}
2. Grep for bare agent handles in app/src/:
   grep -rn "mythos\\|fable\\|ryo\\|cindy\\|dozy\\|codex\\|jett\\|kimi\\|charlwin" app/src/
3. Check that contracts.ts was not modified (unless the task required it)
4. Check that no credentials or private data leaked
5. Verify the changes actually accomplish what the summary claims

Default to skeptical — if anything looks off, report it as a failure.`,
      {
        label: `verify:${lane.lane}`,
        phase: 'Verify',
        schema: VERIFY_SCHEMA,
      }
    )
  )
)

const verified = verifyResults.filter(Boolean)
const passed = verified.filter(v => v.pass)
const failed = verified.filter(v => !v.pass)

if (failed.length > 0) {
  log(`${failed.length} lane(s) failed verification`)
  return {
    status: 'verification-failed',
    passed: passed.length,
    failed: failed.length,
    failures: failed.flatMap(f => f.failures),
    lanes: completedLanes,
  }
}

log(`All ${passed.length} lanes passed adversarial verification`)

// ── Phase 4: Integration merge ─────────────────────────────────────────────

phase('Integrate')

const mergeOrder = ['parse', 'verify', 'render', 'edit', 'deploy', 'docs']
const orderedLanes = completedLanes.sort(
  (a, b) => mergeOrder.indexOf(a.lane) - mergeOrder.indexOf(b.lane)
)

const integration = await agent(
  `Merge verified lanes into main in this order:
${orderedLanes.map((l, i) => `${i + 1}. ${l.lane} (branch: ${l.branch})`).join('\n')}

For each merge:
1. git merge --no-ff <branch> -m "Merge <lane> lane: <summary>"
2. Run the full gate after each merge to catch integration conflicts:
   ${GATE_SCRIPT}
3. If a merge conflicts or breaks the gate, stop and report which lane broke

After all merges, run the full gate one final time and report the result.`,
  { label: 'integrate', schema: VERIFY_SCHEMA }
)

if (!integration || !integration.pass) {
  log('Integration failed')
  return {
    status: 'integration-failed',
    failures: integration ? integration.failures : ['integration returned null'],
    lanes: completedLanes,
  }
}

log('Integration complete — all lanes merged, gate green')

// ── Phase 5: Deploy ────────────────────────────────────────────────────────

phase('Deploy')

const deploy = await agent(
  `Deploy the integrated main branch to Vercel and smoke test.

Steps:
1. Push main to origin
2. Check if a Vercel project is linked (look for .vercel/ or vercel.json)
3. If linked, trigger a production deploy: vercel --prod
4. If not linked, report that manual Vercel setup is needed
5. Once deployed, verify the live URL loads:
   - Check that the index page returns 200
   - Check that /api/extract-smiles returns 401 without a demo key (key-guard works)
   - Check that /api/edit-intent returns 401 without a demo key
6. Report the live URL and smoke test results

If Vercel CLI is not available or deploy fails, report the failure — don't block on it.`,
  { label: 'deploy' }
)

log('Harness run complete')

return {
  status: 'complete',
  baseline,
  lanes: completedLanes.map(l => ({ lane: l.lane, summary: l.summary, branch: l.branch })),
  verification: { passed: passed.length, failed: failed.length },
  integration,
  deploy: deploy || 'deploy skipped or failed',
}
