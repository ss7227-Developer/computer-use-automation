import { startDemo, type Scenario } from './demo-app.js';
import { BrowserSurface } from './surface.js';
import { demoPolicy } from './profile.js';
import { Evidence } from './evidence.js';
import { discover } from './discovery.js';
import { replay } from './engine.js';
import { OpenAIPlanner, FixturePlanner } from './planner.js';

const root = process.env.EVIDENCE_ROOT ?? 'evidence';
const live = process.argv.includes('--live');
async function main() {
  const manifest = new Evidence(root);
  const app = await startDemo();
  const surface = await BrowserSurface.launch(demoPolicy(app.origin));
  const discovery = new Evidence(root);
  let capability;
  try {
    await surface.open('/');
    const planner = live ? new OpenAIPlanner(process.env.OPENAI_API_KEY ?? '',process.env.OPENAI_MODEL) : new FixturePlanner();
    capability = await discover('Look up the supplied member, open their savings review, and read the current savings balance.',{ member_id:'M001' },planner,surface,discovery);
  } finally { await surface.close(); await app.close(); }
  const runs = [];
  for (const scenario of ['normal','not_found','transient','permission'] as Scenario[]) {
    const app = await startDemo(scenario);
    const surface = await BrowserSurface.launch(demoPolicy(app.origin));
    const evidence = new Evidence(root);
    try {
      await surface.open('/');
      const result = await replay(capability,{ member_id:'M002' },surface,evidence);
      const expected = scenario === 'not_found' ? 'business_outcome' : scenario === 'permission' ? 'failure' : 'success';
      if (result.status !== expected) throw new Error(`Unexpected result for ${scenario}`);
      runs.push({ scenario,runId:evidence.runId,status:result.status,...('code' in result?{ code:result.code }:{}) });
    } finally { await surface.close(); await app.close(); }
  }
  await manifest.json('manifest.json',{
    mode: live ? 'live_llm' : 'offline_fixture',discovery:discovery.runId,runs,
    sourceCommit:process.env.GITHUB_SHA ?? null,ciRun:process.env.GITHUB_RUN_ID ?? null,
    note:'Synthetic application. Model decisions are verified against live browser checkpoints. Input/output values are not persisted.',
  });
  console.log(`Evidence complete: ${root}; manifest run ${manifest.runId}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Evidence run failed'); process.exitCode=1; });
