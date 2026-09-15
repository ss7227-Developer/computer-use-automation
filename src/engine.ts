import { Capability, RunError, validateInputs, type Checkpoint, type RunResult, type Values } from './schema.js';
import type { Surface } from './surface.js';
import type { Evidence } from './evidence.js';
import type { Handoff } from './handoff.js';
import { target } from './profile.js';

class BusinessOutcome extends RunError {}
export interface EngineOptions { checkpointTimeoutMs?: number; handoff?: Handoff }

export async function awaitCheckpoint(surface: Surface, check: Checkpoint, evidence: Evidence, step: string, options: EngineOptions = {}): Promise<void> {
  const deadline = Date.now() + (options.checkpointTimeoutMs ?? 2500);
  let recovered = false;
  while (Date.now() < deadline) {
    const observation = await surface.observe();
    if (observation.blocked) throw new RunError('unsafe_surface', 'Unexpected dialog or denied network request');
    if (observation.states.includes('Member not found')) throw new BusinessOutcome('member_not_found', 'Member not found');
    if (observation.states.includes('Invalid member ID')) throw new BusinessOutcome('validation_error', 'Invalid member ID');
    if (observation.states.includes('Permission denied')) throw new RunError('permission_denied', 'Permission denied');
    if (observation.states.includes('Application unavailable')) throw new RunError('application_error', 'Application unavailable');
    if (observation.states.includes('Session expired')) throw new RunError('session_expired', 'Session expired');
    if (observation.states.includes('Temporarily unavailable') && !recovered) {
      recovered = true;
      await evidence.event('recovery', { step, reason: 'transient_load', action: 'retry_lookup', attempt: 1 });
      await surface.act({ kind: 'click', target: target('Retry lookup') }, {});
    }
    if (await surface.matches(check)) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new RunError('checkpoint_timeout', 'Expected checkpoint not observed within bounded wait');
}

export async function finishOutputs(surface: Surface, capability: Capability): Promise<Values> {
  if (!await surface.matches(capability.success)) throw new RunError('success_checkpoint_failed');
  const outputs: Values = {};
  for (const f of capability.outputs) {
    const value = await surface.read(f.target);
    if (f.type === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(value)) throw new RunError('invalid_output');
      const number = Number(value);
      if (!Number.isFinite(number)) throw new RunError('invalid_output');
      outputs[f.name] = number;
    } else outputs[f.name] = value;
  }
  return outputs;
}

export async function replay(raw: unknown, inputs: Values, surface: Surface, evidence: Evidence, options: EngineOptions = {}): Promise<RunResult> {
  let step = 'validation'; let expected = 'Valid capability and typed inputs';
  const runId = evidence.runId;
  try {
    const parsed = Capability.safeParse(raw);
    if (!parsed.success) throw new RunError('invalid_artifact');
    const capability = parsed.data;
    validateInputs(capability, inputs);
    if (capability.app.product !== 'northstar-training' || capability.app.version !== '1' || capability.app.entry !== '/') throw new RunError('incompatible_app');
    await evidence.event('replay_started', { capability: capability.id, revision: capability.revision, llmCalls: 0 });
    for (const s of capability.steps) {
      step = s.id; expected = 'Recorded step checkpoint';
      await evidence.event('step_started', { step, action: s.action.kind });
      try {
        await surface.act(s.action, inputs);
        await awaitCheckpoint(surface, s.checkpoint, evidence, step, options);
      } catch (e) {
        if (e instanceof BusinessOutcome || !options.handoff) throw e;
        // Never retry a click after an ambiguous failure. Human restores the postcondition.
        await options.handoff.request({ capability: capability.id, step, reason: e instanceof RunError ? e.code : 'execution_failed', expected });
        await awaitCheckpoint(surface, s.checkpoint, evidence, step, { ...options, handoff: undefined });
      }
      await evidence.event('step_verified', { step });
    }
    const outputs = await finishOutputs(surface, capability);
    await evidence.event('run_completed', { status: 'success', outputCount: Object.keys(outputs).length });
    await evidence.json('result.json', { status: 'success', runId, outputs: Object.fromEntries(capability.outputs.map(f => [f.name, '[redacted]'])) });
    return { status: 'success', runId, outputs };
  } catch (error) {
    if (error instanceof BusinessOutcome) {
      const result: RunResult = { status: 'business_outcome', runId, code: error.code, step };
      await evidence.event('run_completed', { status: result.status, step, code: result.code });
      await evidence.json('result.json', result); return result;
    }
    const code = error instanceof RunError ? error.code : 'execution_failed';
    await evidence.json('failure-state.json', await surface.evidence().catch(() => ({ unavailable: true })));
    const result: RunResult = { status: 'failure', runId, code, step, expected, observed: error instanceof RunError ? error.observed : 'Execution could not complete', evidence: 'failure-state.json' };
    await evidence.event('run_completed', { status: result.status, step, code });
    await evidence.json('result.json', result); return result;
  }
}
