import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Closed-field audit API: callers never pass browser text, goals, inputs, or model prose. */
export class Evidence {
  readonly runId = randomUUID();
  readonly directory: string;
  private sequence = 0;
  constructor(root: string) { this.directory = join(root, this.runId); }
  async event(event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await appendFile(join(this.directory, 'events.jsonl'), JSON.stringify({ sequence: ++this.sequence, time: new Date().toISOString(), runId: this.runId, event, ...fields }) + '\n', { mode: 0o600 });
  }
  async json(name: string, value: unknown) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  }
}
