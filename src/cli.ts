import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { startDemo, type Scenario } from './demo-app.js';
import { BrowserSurface } from './surface.js';
import { demoPolicy } from './profile.js';
import { Evidence } from './evidence.js';
import { replay } from './engine.js';
import { discover } from './discovery.js';
import { FixturePlanner, OpenAIPlanner } from './planner.js';
import { OperatorHandoff } from './handoff.js';

const { positionals,values } = parseArgs({ allowPositionals:true,options:{
  artifact:{ type:'string' }, member:{ type:'string',default:'M001' }, goal:{ type:'string',default:'Find the member, open their savings review and read the savings balance.' },
  target:{ type:'string' }, scenario:{ type:'string',default:'normal' }, evidence:{ type:'string',default:'evidence' }, headed:{ type:'boolean',default:false }, operator:{ type:'boolean',default:false }, offline:{ type:'boolean',default:false },
} });

async function main() {
  const command = positionals[0];
  if (!['app','demo','discover','replay'].includes(command ?? '')) throw new Error('Use app, demo, discover, or replay. See README.md.');
  const scenarios: Scenario[] = ['normal','not_found','validation','permission','transient','expired','slow','dialog','app_error'];
  if (!scenarios.includes(values.scenario as Scenario)) throw new Error('Unknown scenario');
  const app = values.target ? undefined : await startDemo(values.scenario as Scenario,command === 'app' ? 3000 : 0);
  if (command === 'app') { console.log(app?.origin); return; }
  const origin = values.target ?? app!.origin;
  const surface = await BrowserSurface.launch(demoPolicy(origin),values.headed).catch(async error => { await app?.close(); throw error; });
  try {
    await surface.open('/');
    const evidence = new Evidence(values.evidence!);
    const handoff = values.operator ? new OperatorHandoff(surface,evidence,120000,url => console.log(`Operator console (temporary private link): ${url}`)) : undefined;
    if (command === 'replay') {
      if (!values.artifact) throw new Error('--artifact is required');
      const result = await replay(JSON.parse(await readFile(values.artifact,'utf8')),{ member_id:values.member! },surface,evidence,{ handoff });
      // Outputs are returned by the library; CLI reports only status and evidence location.
      console.log(JSON.stringify({ ...result,...(result.status==='success'?{ outputs:'[redacted; use library return value]' }:{}),directory:evidence.directory },null,2));
      if (result.status === 'failure') process.exitCode = 1;
    } else {
      const planner = command === 'demo' || values.offline ? new FixturePlanner() : new OpenAIPlanner(process.env.OPENAI_API_KEY ?? '',process.env.OPENAI_MODEL);
      const capability = await discover(values.goal!,{ member_id:values.member! },planner,surface,evidence,{ handoff });
      console.log(`Artifact: ${evidence.directory}/capability.json (${planner.mode})`);
      if (command === 'demo') {
        await surface.open('/');
        const replayEvidence = new Evidence(values.evidence!);
        const result = await replay(capability,{ member_id:'M002' },surface,replayEvidence);
        console.log(`Replay: ${result.status}; evidence: ${replayEvidence.directory}`);
        if (result.status !== 'success') process.exitCode = 1;
      }
    }
  } finally { await surface.close(); await app?.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Command failed'); process.exitCode=1; });
