import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { BrowserSurface } from './surface.js';
import type { Evidence } from './evidence.js';
import { RunError } from './schema.js';

export interface Intervention { step: string; reason: string; expected: string; capability: string }
export interface Handoff { request(request: Intervention): Promise<void> }

/** One process owns the lease. A paused step can only continue after claim -> resume. */
export class OperatorHandoff implements Handoff {
  constructor(private surface: BrowserSurface, private evidence: Evidence, private timeoutMs = 120000,
    private onReady?: (url: string) => void) {}
  async request(request: Intervention): Promise<void> {
    if (this.surface.owner !== 'automation') throw new RunError('invalid_control_transition');
    this.surface.owner = 'pending';
    await this.evidence.event('intervention_requested', { ...request, owner: 'pending' });
    await this.evidence.json('intervention-state.json', await this.surface.evidence());
    this.surface.humanAction = async (kind, control) => this.evidence.event('human_action', { kind, control });
    const token = randomBytes(24).toString('hex');
    let finish!: (e?: Error) => void;
    const completed = new Promise<void>((resolve, reject) => { finish = e => e ? reject(e) : resolve(); });
    // Attach immediately so a timeout during startup cannot become an unhandled rejection.
    void completed.catch(() => {});
    let busy = false;
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      if (req.headers.host !== new URL(base).host || (req.headers.origin && req.headers.origin !== base)) { res.writeHead(403).end(); return; }
      const url = new URL(req.url || '/', base);
      if (url.searchParams.get('token') !== token) { res.writeHead(403).end(); return; }
      if (req.method === 'GET' && url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<h1>Operator handoff</h1><p>Control: ${this.surface.owner}</p><p>Claim the session, operate the open training browser, then resume. The engine rechecks the pending checkpoint.</p><form method="post" action="/claim?token=${token}"><button>Claim session</button></form><form method="post" action="/resume?token=${token}"><button>Resume automation</button></form><form method="post" action="/abort?token=${token}"><button>Abort run</button></form>`); return;
      }
      if (req.method !== 'POST' || busy) { res.writeHead(409).end(); return; }
      busy = true;
      try {
        if (url.pathname === '/claim' && this.surface.owner === 'pending') {
          this.surface.owner = 'human';
          await this.evidence.event('control_transferred', { owner: 'human', step: request.step });
          await this.surface.page.bringToFront();
          res.writeHead(303, { Location: `/?token=${token}` }).end();
        } else if (url.pathname === '/resume' && this.surface.owner === 'human') {
          this.surface.owner = 'automation';
          await this.evidence.event('control_transferred', { owner: 'automation', step: request.step });
          res.end('Resuming; checkpoint verification is required.'); finish();
        } else if (url.pathname === '/abort') { res.end('Aborted'); finish(new RunError('operator_aborted')); }
        else res.writeHead(409).end();
      } catch { res.writeHead(500).end(); finish(new RunError('handoff_failed')); }
      finally { busy = false; }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const timer = setTimeout(() => finish(new RunError('intervention_timeout')), this.timeoutMs);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/?token=${token}`;
    this.onReady?.(url);
    try { await completed; }
    finally {
      clearTimeout(timer);
      this.surface.humanAction = undefined;
      await new Promise<void>(resolve => server.close(() => resolve()));
      if ((this.surface.owner as string) !== 'automation') this.surface.owner = 'closed';
    }
  }
}
