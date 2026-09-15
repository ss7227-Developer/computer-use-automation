import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Capability, validateInputs, type Values } from '../src/schema.js';
import { demoPolicy, fixture, inputTarget, target } from '../src/profile.js';

test('artifact contract rejects raw values, unknown schema versions, missing references, and duplicate steps', () => {
  assert.equal(Capability.safeParse(fixture()).success, true);
  const cases = [
    { ...fixture(), schemaVersion: '2' },
    { ...fixture(), steps: [...fixture().steps, fixture().steps[0]] },
    { ...fixture(), steps: [{ ...fixture().steps[0], action: { kind: 'fill', target: inputTarget, value: 'secret' } }] },
    { ...fixture(), steps: [{ ...fixture().steps[0], action: { kind: 'fill', target: inputTarget, input: 'undeclared' } }] },
  ];
  for (const c of cases) assert.equal(Capability.safeParse(c).success, false);
});
test('input validation rejects absent, extra, and wrong typed arguments', () => {
  for (const values of [{}, { member_id: 123 }, { member_id: 'M001', token: 'secret' }] as Values[]) assert.throws(() => validateInputs(fixture(), values));
  assert.doesNotThrow(() => validateInputs(fixture(), { member_id: 'M002' }));
});
test('policy denies unlisted origins, routes, credentials, queries, actions, and irreversible controls', () => {
  const policy = demoPolicy('http://127.0.0.1:3333');
  for (const url of ['https://evil.test/', 'http://127.0.0.1:3333/admin', 'http://u:p@127.0.0.1:3333/', 'http://127.0.0.1:3333/?token=x', 'file:///etc/passwd']) assert.throws(() => policy.url(url));
  assert.doesNotThrow(() => policy.url('http://127.0.0.1:3333/workspace'));
  assert.throws(() => policy.action({ kind: 'click', target: target('Close account') }));
  assert.throws(() => policy.action({ kind: 'click', target: target('Pay') }));
  assert.doesNotThrow(() => policy.action({ kind: 'click', target: target('Search') }));
});
