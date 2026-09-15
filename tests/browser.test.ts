import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDemo, type Scenario } from '../src/demo-app.js';
import { BrowserSurface } from '../src/surface.js';
import { demoPolicy, fixture, target } from '../src/profile.js';
import { Evidence } from '../src/evidence.js';
import { replay } from '../src/engine.js';
import { OperatorHandoff } from '../src/handoff.js';
import { discover } from '../src/discovery.js';
import { FixturePlanner } from '../src/planner.js';

async function setup(scenario: Scenario = 'normal') {
  const app = await startDemo(scenario);
  const surface = await BrowserSurface.launch(demoPolicy(app.origin)).catch(async error => { await app.close(); throw error; });
  await surface.open('/');
  const evidence = new Evidence(process.env.TEST_EVIDENCE_ROOT ?? await mkdtemp(join(tmpdir(), 'capability-test-')));
  return { app, surface, evidence, close: async () => { await surface.close(); await app.close(); } };
}
test('real browser: parameterized replay, output extraction, no persisted inputs or output values', async () => {
  const f = await setup();
  try {
    const result = await replay(fixture(), { member_id: 'M002' }, f.surface, f.evidence);
    assert.equal(result.status, 'success');
    if (result.status === 'success') assert.equal(result.outputs.savings_balance, 9820.75);
    const files = await Promise.all(['events.jsonl', 'result.json'].map(n => readFile(join(f.evidence.directory,n),'utf8')));
    assert(!files.join('').includes('M002'));
    assert(!files.join('').includes('9820.75'));
  } finally { await f.close(); }
});
for (const [scenario, status, code] of [
  ['not_found','business_outcome','member_not_found'], ['validation','business_outcome','validation_error'],
  ['permission','failure','permission_denied'], ['expired','failure','session_expired'],
  ['app_error','failure','application_error'], ['dialog','failure','unsafe_surface'],
  ['transient','success',null], ['slow','success',null],
] as const) test(`real browser: ${scenario} yields ${status}`, async () => {
  const f = await setup(scenario);
  try {
    const result = await replay(fixture(), { member_id: 'M001' }, f.surface, f.evidence);
    assert.equal(result.status,status);
    if ('code' in result) assert.equal(result.code,code);
    if (scenario === 'transient') assert.match(await readFile(join(f.evidence.directory,'events.jsonl'),'utf8'), /"event":"recovery"/);
    if (result.status === 'failure') {
      const snapshot = await readFile(join(f.evidence.directory,'failure-state.json'),'utf8');
      assert.match(snapshot,/redacted_dom_structure/);
      assert.match(snapshot,/"tag": "body"/);
      assert.match(snapshot,/"tag": "h2"/);
      assert(!snapshot.includes('M001'));
    }
  } finally { await f.close(); }
});
test('handoff claim, manual action in SAME page, resume, checkpoint verification', async () => {
  const f = await setup('expired');
  const originalPage = f.surface.page;
  let operatorWork: Promise<void> | undefined;
  const handoff = new OperatorHandoff(f.surface, f.evidence, 10000, url => {
    operatorWork = (async () => {
      const endpoint = (name: string) => url.replace('/?',`/${name}?`);
      assert.equal((await fetch(endpoint('resume'), { method: 'POST' })).status,409);
      assert.equal((await fetch(endpoint('claim'), { method: 'POST', redirect: 'manual' })).status,303);
      await assert.rejects(f.surface.act({ kind:'click', target:target('Search') },{}),/control_not_owned/);
      // Simulated operator, not represented as a real human in evidence.
      await f.evidence.event('test_operator', { simulated: true });
      await f.surface.locator(target('Restore training session')).click();
      assert.equal(f.surface.page,originalPage);
      assert.equal((await fetch(endpoint('resume'), { method:'POST' })).status,200);
    })();
  });
  try {
    const result = await replay(fixture(),{ member_id:'M001' },f.surface,f.evidence,{ handoff });
    await operatorWork;
    assert.equal(result.status,'success');
    const events = await readFile(join(f.evidence.directory,'events.jsonl'),'utf8');
    assert.match(events,/"owner":"human"/);
    assert.match(events,/"event":"human_action"/);
    assert.match(events,/"owner":"automation"/);
  } finally { await f.close(); }
});
test('ambiguous targets fail closed and risky controls cannot be automated', async () => {
  const f = await setup();
  try {
    await assert.rejects(f.surface.act({ kind:'click', target:target('Close account') },{}),/risky_action/);
    await f.surface.page.frame({ name:'workspace' })!.evaluate(() => { const b=document.createElement('button'); b.textContent='Search'; document.body.appendChild(b); });
    const result = await replay(fixture(),{ member_id:'M001' },f.surface,f.evidence);
    assert.equal(result.status,'failure');
    if ('code' in result) assert.equal(result.code,'ambiguous_target');
  } finally { await f.close(); }
});
test('offline discovery records an artifact and replays it with different inputs', async () => {
  const f = await setup();
  try {
    const capability = await discover('Open the savings review',{ member_id:'M001' },new FixturePlanner(),f.surface,f.evidence);
    assert.equal(capability.provenance.mode,'offline_fixture');
    assert.equal(capability.steps.length,4);
    assert(!JSON.stringify(capability).includes('M001'));
    await f.surface.open('/');
    const result = await replay(capability,{ member_id:'M002' },f.surface,new Evidence(f.evidence.directory));
    assert.equal(result.status,'success');
    if (result.status === 'success') assert.equal(result.outputs.savings_balance,9820.75);
  } finally { await f.close(); }
});
test('premature model completion and step exhaustion cannot emit a successful artifact', async () => {
  const f = await setup();
  try {
    await assert.rejects(discover('Review',{ member_id:'M001' },{ mode:'offline_fixture',provider:'test',decide:async()=>({ decision:{ kind:'finish',control:null,input:null,expected:null,reason:'verify_goal' } }) },f.surface,f.evidence));
    await assert.rejects(discover('Review',{ member_id:'M001' },new FixturePlanner(),f.surface,f.evidence,{ maxSteps:1 }),/max_steps/);
  } finally { await f.close(); }
});
