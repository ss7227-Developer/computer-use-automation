import { Capability, RunError, validateInputs, type Values, type Action } from './schema.js';
import type { Surface } from './surface.js';
import { Decision, type Planner } from './planner.js';
import type { Evidence } from './evidence.js';
import { contract, heading, publicHeadings } from './profile.js';
import { awaitCheckpoint, finishOutputs, type EngineOptions } from './engine.js';

export async function discover(goal: string, inputs: Values, planner: Planner, surface: Surface, evidence: Evidence, options: EngineOptions & { maxSteps?: number; timeoutMs?: number } = {}): Promise<Capability> {
  const base = contract(evidence.runId,planner.mode,planner.provider);
  // Validate parameters before making any external model call or browser action.
  validateInputs({ ...base, steps: [] },inputs);
  const sanitizedGoal = Object.values(inputs).reduce<string>((g,v) => g.split(String(v)).join('[input:member_id]'),goal);
  const history: Decision[] = []; const steps: Capability['steps'] = [];
  const deadline = Date.now() + (options.timeoutMs ?? 90000);
  await evidence.event('discovery_started',{ mode:planner.mode,provider:planner.provider });
  try {
    for (let i = 0; i < (options.maxSteps ?? 12); i++) {
      if (Date.now() >= deadline) throw new RunError('discovery_timeout');
      const observation = await surface.observe();
      if (observation.blocked) throw new RunError('unsafe_surface');
      const proposed = await planner.decide(sanitizedGoal,observation,history,AbortSignal.timeout(Math.max(1,deadline-Date.now())));
      const decision = Decision.parse(proposed.decision);
      await evidence.event('decision',{ step:i,action:decision.kind,reason:decision.reason,responseId:proposed.responseId });
      if (decision.kind === 'finish') {
        const capability = Capability.parse({ ...base,steps });
        await finishOutputs(surface,capability);
        await evidence.json('capability.json',capability);
        await evidence.json('discovery-state.json',await surface.evidence());
        await evidence.event('discovery_completed',{ steps:steps.length,mode:planner.mode });
        return capability;
      }
      if (decision.kind === 'escalate') {
        if (!options.handoff) throw new RunError('model_requested_intervention');
        await options.handoff.request({ capability:base.id,step:`step_${i+1}`,reason:'model_requested_intervention',expected:'Restore an actionable state' });
        history.push(decision);
        continue;
      }
      const selected = decision.control === null ? undefined : observation.controls[decision.control];
      if (!selected || !decision.expected || !publicHeadings.includes(decision.expected)) throw new RunError('invalid_model_action');
      if (decision.kind === 'fill' && decision.input !== 'member_id') throw new RunError('invalid_model_input');
      const action: Action = decision.kind === 'fill' ? { kind:'fill',target:selected,input:'member_id' } : { kind:'click',target:selected };
      const checkpoint = heading(decision.expected);
      const step = `step_${i+1}`;
      try {
        await surface.act(action,inputs);
        await awaitCheckpoint(surface,checkpoint,evidence,step,options);
      } catch (error) {
        if (!options.handoff) throw error;
        await options.handoff.request({ capability:base.id,step,reason:error instanceof RunError ? error.code : 'execution_failed',expected:'Restore the proposed step checkpoint' });
        await awaitCheckpoint(surface,checkpoint,evidence,step,{ ...options,handoff:undefined });
      }
      steps.push({ id:step,action,checkpoint,rationale:decision.reason === 'enter_input' ? 'Resolve typed input locally into a uniquely identified control.' : 'Use the visible control and verify the next state before advancing.' });
      history.push(decision);
      await evidence.event('step_verified',{ step,action:action.kind });
    }
    throw new RunError('max_steps');
  } catch (error) {
    const code = error instanceof RunError ? error.code : 'discovery_failed';
    await evidence.json('failure-state.json',await surface.evidence().catch(() => ({ unavailable:true })));
    await evidence.event('discovery_stopped',{ code });
    if (options.handoff) await options.handoff.request({ capability:base.id,step:`step_${steps.length+1}`,reason:code,expected:'Operator inspection required; discovery artifact withheld' });
    throw new RunError(code);
  }
}
