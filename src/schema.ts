import { z } from 'zod';

export const Identifier = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const Target = z.object({
  frame: z.string().max(80).default(''),
  by: z.enum(['role', 'label', 'text']),
  role: z.enum(['button', 'link', 'textbox', 'heading', 'status', 'cell', 'combobox']).optional(),
  name: z.string().min(1).max(160),
}).strict().refine(t => t.by !== 'role' || t.role !== undefined, 'Role target requires role');
export type Target = z.infer<typeof Target>;
export const Checkpoint = z.object({ target: Target, text: z.string().max(160).optional() }).strict();
export type Checkpoint = z.infer<typeof Checkpoint>;
export const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), target: Target }).strict(),
  z.object({ kind: z.literal('fill'), target: Target, input: Identifier }).strict(),
]);
export type Action = z.infer<typeof Action>;
const Field = z.object({
  name: Identifier, type: z.enum(['string', 'number']), sensitive: z.boolean(),
  description: z.string().max(200),
}).strict();
export const Capability = z.object({
  schemaVersion: z.literal('1.0'), id: Identifier, revision: z.number().int().positive(),
  description: z.string().max(300),
  app: z.object({ product: z.string(), version: z.string(), entry: z.string().startsWith('/') }).strict(),
  inputs: z.array(Field).min(1),
  outputs: z.array(Field.extend({ target: Target })).min(1),
  steps: z.array(z.object({
    id: Identifier, action: Action, checkpoint: Checkpoint,
    rationale: z.string().max(300),
  }).strict()).min(1).max(30),
  success: Checkpoint,
  provenance: z.object({ mode: z.enum(['live_llm', 'offline_fixture']), provider: z.string(), runId: z.string() }).strict(),
}).strict().superRefine((c, ctx) => {
  for (const list of [c.inputs, c.outputs, c.steps]) {
    const names = list.map(x => 'name' in x ? x.name : x.id);
    if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'Duplicate identifiers' });
  }
  for (const s of c.steps) {
    const action = s.action;
    if (action.kind === 'fill' && !c.inputs.some(i => i.name === action.input))
      ctx.addIssue({ code: 'custom', message: 'Undeclared input reference' });
  }
});
export type Capability = z.infer<typeof Capability>;
export type Values = Record<string, string | number>;
export type RunResult =
  | { status: 'success'; runId: string; outputs: Values }
  | { status: 'business_outcome'; runId: string; code: string; step: string }
  | { status: 'failure'; runId: string; code: string; step: string; expected: string; observed: string; evidence?: string };

export class RunError extends Error {
  constructor(public code: string, public observed = 'No matching permitted state') { super(code); }
}
export function validateInputs(capability: Capability, values: Values): void {
  if (Object.keys(values).some(k => !capability.inputs.some(i => i.name === k))) throw new RunError('invalid_input');
  for (const f of capability.inputs) {
    const v = values[f.name];
    if (typeof v !== f.type || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && (v.length === 0 || v.length > 100)))
      throw new RunError('invalid_input');
  }
}
