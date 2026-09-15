import { type Action, type Target, RunError } from './schema.js';

export type ActionRule = { target: Target; kinds: Action['kind'][]; risk: 'safe' | 'risky' };
export interface PolicyConfig { origin: string; routes: string[]; rules: ActionRule[]; publicTexts: string[] }
export const sameTarget = (a: Target, b: Target) => a.frame === b.frame && a.by === b.by && a.role === b.role && a.name === b.name;

/** Policy is operator configuration, never supplied or widened by the model/artifact. */
export class Policy {
  constructor(readonly config: PolicyConfig) {}
  url(value: string): void {
    let u: URL;
    try { u = new URL(value); } catch { throw new RunError('url_denied'); }
    if (u.origin !== this.config.origin || u.username || u.password || u.search || u.hash || !this.config.routes.includes(u.pathname))
      throw new RunError('url_denied');
  }
  action(action: Action): void {
    const rule = this.config.rules.find(r => sameTarget(r.target, action.target) && r.kinds.includes(action.kind));
    if (!rule) throw new RunError('action_denied');
    if (rule.risk !== 'safe') throw new RunError('risky_action');
  }
  publicText(text: string): boolean { return this.config.publicTexts.includes(text); }
}
