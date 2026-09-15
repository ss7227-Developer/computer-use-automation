import { Policy } from './policy.js';
import type { Capability, Checkpoint, Target } from './schema.js';

export const target = (name: string, role: NonNullable<Target['role']> = 'button'): Target => ({ frame: 'workspace', by: 'role', role, name });
export const heading = (name: string): Checkpoint => ({ target: target(name, 'heading') });
export const inputTarget: Target = { frame: 'workspace', by: 'label', name: 'Member ID' };
export const publicHeadings = ['Member search', 'Search results', 'Member overview', 'Savings review', 'Member not found', 'Invalid member ID', 'Permission denied', 'Temporarily unavailable', 'Session expired', 'Loading member', 'Application unavailable'];
export function demoPolicy(origin: string): Policy {
  return new Policy({ origin, routes: ['/', '/workspace', '/favicon.ico'], publicTexts: [...publicHeadings, 'Member ID', 'Search', 'Open member', 'Review savings', 'Savings balance', 'Retry lookup', 'Restore training session', 'Close account'], rules: [
    { target: inputTarget, kinds: ['fill'], risk: 'safe' },
    ...['Search', 'Open member', 'Review savings', 'Retry lookup'].map(name => ({ target: target(name), kinds: ['click' as const], risk: 'safe' as const })),
    ...['Close account', 'Restore training session'].map(name => ({ target: target(name), kinds: ['click' as const], risk: 'risky' as const })),
  ] });
}
export function contract(runId: string, mode: Capability['provenance']['mode'], provider: string): Omit<Capability, 'steps'> {
  return {
    schemaVersion: '1.0', id: 'review_savings', revision: 1,
    description: 'Find a member, open their savings review, and return the current balance. No transaction is submitted.',
    app: { product: 'northstar-training', version: '1', entry: '/' },
    inputs: [{ name: 'member_id', type: 'string', sensitive: true, description: 'Synthetic member reference supplied at invocation' }],
    outputs: [{ name: 'savings_balance', type: 'number', sensitive: true, description: 'Savings balance in USD', target: target('Savings balance', 'status') }],
    success: heading('Savings review'), provenance: { mode, provider, runId },
  };
}

/** Fixture is explicitly labeled; it exercises the same execution pipeline, not the LLM. */
export function fixture(runId = 'fixture'): Capability {
  return { ...contract(runId, 'offline_fixture', 'scripted-test'), steps: [
    { id: 'enter_member', action: { kind: 'fill', target: inputTarget, input: 'member_id' }, checkpoint: heading('Member search'), rationale: 'Fill the uniquely labeled field inside the servicing frame.' },
    { id: 'search', action: { kind: 'click', target: target('Search') }, checkpoint: heading('Search results'), rationale: 'Wait for a visible result list or a classified runtime outcome.' },
    { id: 'open_member', action: { kind: 'click', target: target('Open member') }, checkpoint: heading('Member overview'), rationale: 'Open the unique search result, then verify the overview.' },
    { id: 'review', action: { kind: 'click', target: target('Review savings') }, checkpoint: heading('Savings review'), rationale: 'Reach the read-only review checkpoint before extracting the balance.' },
  ] };
}
