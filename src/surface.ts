import { chromium, type Browser, type BrowserContext, type Frame, type Locator, type Page } from 'playwright';
import { type Action, type Checkpoint, type Target, type Values, RunError } from './schema.js';
import { type Policy } from './policy.js';

export interface Observation { states: string[]; controls: Target[]; blocked: boolean }
export interface Surface {
  observe(): Promise<Observation>;
  act(action: Action, inputs: Values): Promise<void>;
  matches(check: Checkpoint): Promise<boolean>;
  read(target: Target): Promise<string>;
  evidence(): Promise<unknown>;
}

export class BrowserSurface implements Surface {
  private constructor(readonly browser: Browser, readonly context: BrowserContext, readonly page: Page, readonly policy: Policy) {}
  blocked = false;
  dialogSeen = false;
  owner: 'automation' | 'pending' | 'human' | 'closed' = 'automation';
  humanAction?: (kind: string, control: string) => Promise<void>;

  static async launch(policy: Policy, headed = false): Promise<BrowserSurface> {
    const browser = await chromium.launch({ headless: !headed, executablePath: process.env.BROWSER_EXECUTABLE_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    const page = await context.newPage();
    const surface = new BrowserSurface(browser, context, page, policy);
    page.setDefaultTimeout(1500);
    await context.route('**/*', async route => {
      try { policy.url(route.request().url()); await route.continue(); }
      catch { surface.blocked = true; await route.abort('blockedbyclient'); }
    });
    await context.routeWebSocket('**/*', socket => { surface.blocked = true; socket.close(); });
    context.on('page', p => { if (p !== page) { surface.blocked = true; void p.close(); } });
    page.on('dialog', async dialog => { surface.dialogSeen = true; await dialog.dismiss(); });
    page.on('download', download => { surface.blocked = true; void download.cancel(); });
    await context.exposeBinding('__auditHuman', async (_, event: { kind?: unknown; label?: unknown }) => {
      if (surface.owner !== 'human') return;
      const kind = ['click', 'input', 'change'].includes(String(event.kind)) ? String(event.kind) : 'other';
      const label = typeof event.label === 'string' && policy.publicText(event.label) ? event.label : '[redacted-control]';
      await surface.humanAction?.(kind, label);
    });
    await context.addInitScript(() => {
      for (const kind of ['click', 'input', 'change']) document.addEventListener(kind, event => {
        const node = event.target as HTMLElement;
        const label = node.getAttribute('aria-label') || (node.tagName === 'BUTTON' ? node.textContent : '') || '';
        void (window as unknown as { __auditHuman(e: unknown): Promise<void> }).__auditHuman({ kind, label });
      }, true);
    });
    return surface;
  }
  async open(entry: string) {
    const url = new URL(entry, this.policy.config.origin).href;
    this.policy.url(url);
    await this.page.goto(url, { waitUntil: 'load', timeout: 10000 });
  }
  private frame(name: string): Frame {
    const frames = name ? this.page.frames().filter(f => f.name() === name) : [this.page.mainFrame()];
    if (frames.length !== 1) throw new RunError('ambiguous_frame');
    const frame = frames[0]!;
    this.policy.url(frame.url());
    return frame;
  }
  locator(t: Target): Locator {
    const frame = this.frame(t.frame);
    if (t.by === 'label') return frame.getByLabel(t.name, { exact: true });
    if (t.by === 'text') return frame.getByText(t.name, { exact: true });
    return frame.getByRole(t.role!, { name: t.name, exact: true });
  }
  async visible(t: Target): Promise<boolean> {
    const locator = this.locator(t);
    const count = await locator.count();
    if (count > 1) throw new RunError('ambiguous_target');
    return count === 1 && await locator.isVisible();
  }
  async observe(): Promise<Observation> {
    this.policy.url(this.page.url());
    const controls: Target[] = [];
    const states: string[] = [];
    for (const rule of this.policy.config.rules) if (await this.visible(rule.target)) controls.push(rule.target);
    for (const name of this.policy.config.publicTexts) {
      if (await this.visible({ frame: 'workspace', by: 'role', role: 'heading', name })) states.push(name);
    }
    return { controls, states, blocked: this.blocked || this.dialogSeen };
  }
  async act(action: Action, inputs: Values): Promise<void> {
    if (this.owner !== 'automation') throw new RunError('control_not_owned');
    if (this.blocked || this.dialogSeen) throw new RunError('unsafe_surface');
    this.policy.url(this.page.url());
    this.policy.action(action);
    const locator = this.locator(action.target);
    if (await locator.count() !== 1) throw new RunError('ambiguous_or_missing_target');
    try {
      if (action.kind === 'fill') {
        if (!Object.hasOwn(inputs, action.input)) throw new RunError('invalid_input');
        await locator.fill(String(inputs[action.input]));
        if (await locator.inputValue() !== String(inputs[action.input])) throw new RunError('fill_not_applied');
      } else await locator.click();
    } catch (error) {
      if (error instanceof RunError) throw error;
      // Playwright errors may embed entered values and DOM text. Do not persist their message.
      throw new RunError('action_failed');
    }
  }
  async matches(check: Checkpoint): Promise<boolean> {
    if (!await this.visible(check.target)) return false;
    return check.text === undefined || await this.read(check.target) === check.text;
  }
  async read(t: Target): Promise<string> {
    const locator = this.locator(t);
    if (await locator.count() !== 1) throw new RunError('ambiguous_or_missing_target');
    return (await locator.innerText()).trim();
  }
  async evidence(): Promise<unknown> {
    // A structural DOM snapshot, with no text nodes, values, IDs, URLs, attributes, or HTML.
    const frames = [];
    for (const frame of this.page.frames()) {
      try {
        this.policy.url(frame.url());
        const structure = await frame.locator('body').evaluate(el => {
          const visit = (node: Element, depth: number): unknown => ({ tag: node.tagName.toLowerCase(), children: depth < 6 ? Array.from(node.children).filter(e => !['SCRIPT', 'STYLE'].includes(e.tagName)).slice(0,80).map(e => visit(e,depth+1)) : [] });
          return visit(el, 0);
        });
        frames.push({ frame: frame === this.page.mainFrame() ? 'main' : 'child', structure });
      } catch { frames.push({ frame: 'unavailable' }); }
    }
    return { kind: 'redacted_dom_structure', frames, state: await this.observe().catch(() => ({ blocked: true })) };
  }
  async close() { this.owner = 'closed'; await this.browser.close(); }
}
