import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';

const source = stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/team-payment-invoice4u-ipn/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, ''));
const now = Date.parse('2026-10-08T05:18:00Z');
const requestRow = (changes = {}) => ({
  id: 'request-a', parent_phone_normalized: '0500000001', parent_email_normalized: 'registered@example.com',
  request_status: 'payment_pending', payment_status: 'not_started', amount_agorot: 15000,
  number_of_cycles: 9, checkout_started_at: new Date(now - 2 * 60000).toISOString(), ...changes
});

function fixture(requests = [requestRow()], options = {}) {
  const tables = { team_payment_requests: structuredClone(requests), team_payment_provider_events: [], team_payment_rate_limits: [], team_payment_provider_secrets: [] };
  const writes = [], errors = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.maximum = Infinity; this.single = false; this.mode = 'select'; }
    select() { return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    order() { return this; }
    limit(n) { this.maximum = n; return this; }
    maybeSingle() { this.single = true; return this; }
    insert(value) { this.mode = 'insert'; this.value = value; return this; }
    update(value) { this.mode = 'update'; this.value = value; return this; }
    then(resolve, reject) {
      try {
        if (options.lookupFailure && this.table === 'team_payment_requests') return Promise.resolve({ data: null, error: { message: 'fixture database failure' } }).then(resolve, reject);
        const rows = (tables[this.table] || []).filter(row => this.filters.every(f => f(row))).slice(0, this.maximum);
        if (this.mode === 'insert') {
          const value = structuredClone(this.value); writes.push({ table: this.table, mode: this.mode, value });
          tables[this.table].push({ id: 'event-' + writes.length, ...value });
        } else if (this.mode === 'update') {
          writes.push({ table: this.table, mode: this.mode, value: structuredClone(this.value) });
          for (const row of rows) Object.assign(row, this.value);
        }
        return Promise.resolve({ data: this.single ? rows[0] || null : rows, error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    }
  }
  let handler;
  class FixedDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: FixedDate, TextEncoder, URL, URLSearchParams, Request, Response, crypto: webcrypto,
    console: { error: (...args) => errors.push(args) }, createClient: () => ({ from: name => new Query(name) }),
    Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-key' : undefined }, serve: fn => { handler = fn; } }
  });
  vm.runInContext(source, context);
  return { tables, writes, errors, context, handler, match: (phone, email, amount = 15000, duration = 9) => context.matchUnique({ from: name => new Query(name) }, phone, email, amount, duration) };
}
function callback(changes = {}) {
  return { sum: '150', ownerId: 'example-payer-id', cardSuffix: '1234', cardExpDate: '0828', clientName: 'Test Parent',
    clientEmail: 'payer@example.com', clientPhone: '+972 50-000-0001', paymentsNum: '0',
    jsonParamsBase64: 'ZW5jb2RlZCBjYXJkIG1ldGFkYXRh', clearingConfirmation: 'example-approval',
    standingOrderDuration: '9', standingOrderFirstChargeAmount: '0', ...changes };
}
function post(payload, suffix = '') { return new Request('https://example.com/ipn' + suffix, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(payload) }); }

test('a different payer email links only the unique phone, recent checkout, matching amount and cycles', async () => {
  const h = fixture(); const match = await h.match('0500000001', 'payer@example.com');
  assert.equal(match.request.id, 'request-a'); assert.equal(match.strategy, 'phone_recent_checkout_email_mismatch');
  assert.equal(h.writes.length, 0);
});

test('exact phone and email matching remains available without additional sales-page metadata', async () => {
  const h = fixture(); const match = await h.match('0500000001', 'registered@example.com', null, null);
  assert.equal(match.request.id, 'request-a'); assert.equal(match.strategy, 'phone_email_unique');
});

test('siblings sharing a phone are never guessed when the payment email differs', async () => {
  const h = fixture([requestRow(), requestRow({ id: 'request-b', checkout_started_at: null, request_status: 'sent' })]);
  const match = await h.match('0500000001', 'payer@example.com');
  assert.equal(match.request, null); assert.equal(match.strategy, 'ambiguous');
});

test('a payer email belonging to another eligible request prevents fallback matching', async () => {
  const h = fixture([requestRow(), requestRow({ id: 'other-family', parent_phone_normalized: '0500000002', parent_email_normalized: 'payer@example.com' })]);
  const match = await h.match('0500000001', 'payer@example.com');
  assert.equal(match.request, null); assert.equal(match.strategy, 'conflicting_email');
});

test('fallback rejects old or future checkouts, active requests and inconsistent financial metadata', async () => {
  for (const changes of [
    { checkout_started_at: new Date(now - 31 * 60000).toISOString() },
    { checkout_started_at: new Date(now + 1000).toISOString() }, { checkout_started_at: null },
    { request_status: 'completed', payment_status: 'active' }, { payment_status: 'cancelled' },
    { amount_agorot: 16000 }, { number_of_cycles: 8 }
  ]) {
    const match = await fixture([requestRow(changes)]).match('0500000001', 'payer@example.com');
    assert.equal(match.request, null, JSON.stringify(changes));
  }
  for (const [amount, cycles] of [[null, 9], [15000, null], [0, 9]]) {
    assert.equal((await fixture().match('0500000001', 'payer@example.com', amount, cycles)).request, null);
  }
});

test('capture stores plan metadata and zero first-charge override without reporting an actual debit', async () => {
  const h = fixture(); const before = structuredClone(h.tables.team_payment_requests);
  const response = await h.handler(post(callback())); assert.equal(response.status, 200);
  const event = h.tables.team_payment_provider_events[0];
  assert.equal(event.request_id, 'request-a'); assert.equal(event.processing_status, 'received');
  assert.equal(event.verification_status, 'unverified'); assert.equal(event.payment_status, null);
  assert.equal(event.provider_transaction_id, null); assert.equal(event.provider_recurring_id, null);
  assert.equal(event.normalized_payload.standing_order_amount_agorot, 15000);
  assert.equal(event.normalized_payload.standing_order_duration, 9);
  assert.equal(event.normalized_payload.standing_order_first_charge_amount_agorot, 0);
  assert.equal(event.normalized_payload.clearing_confirmation, 'example-approval');
  assert.equal(event.normalized_payload.parent_email_differs, true);
  assert.equal(event.error_message, 'IPN_MAPPING_PENDING');
  assert.deepEqual(h.tables.team_payment_requests, before);
  assert.ok(h.writes.every(w => w.table !== 'team_payment_requests'));
});

test('raw callback redacts card metadata, payer identifiers and opaque encoded copies', async () => {
  const h = fixture(); await h.handler(post(callback()));
  const raw = h.tables.team_payment_provider_events[0].raw_payload;
  for (const key of ['ownerId', 'cardSuffix', 'cardExpDate', 'jsonParamsBase64']) assert.equal(raw[key], '[REDACTED]', key);
  assert.equal(raw.sum, '150'); assert.equal(raw.standingOrderDuration, '9');
});

test('repeated callback delivery is idempotent and never creates a second order or debit', async () => {
  const h = fixture(); assert.equal((await h.handler(post(callback()))).status, 200);
  const second = await h.handler(post(callback())); assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, true); assert.equal(h.tables.team_payment_provider_events.length, 1);
  assert.ok(h.writes.every(w => w.table !== 'team_payment_requests'));
});

test('ambiguous capture remains unverified and unlinked', async () => {
  const h = fixture([requestRow(), requestRow({ id: 'request-b' })]); await h.handler(post(callback()));
  const event = h.tables.team_payment_provider_events[0];
  assert.equal(event.request_id, null); assert.equal(event.processing_status, 'unmatched');
  assert.equal(event.match_strategy, 'ambiguous'); assert.equal(event.verification_status, 'unverified');
});

test('malformed amounts and cycle counts cannot enable fallback matching', async () => {
  for (const changes of [{ sum: '-150' }, { sum: '15000abc' }, { sum: '150.001' }, { standingOrderDuration: '9months' }, { standingOrderDuration: '0' }]) {
    const h = fixture(); await h.handler(post(callback(changes)));
    assert.equal(h.tables.team_payment_provider_events[0].request_id, null, JSON.stringify(changes));
  }
});

test('empty payload, invalid authentication and failed lookup cannot be accepted as confirmed payment', async () => {
  const h = fixture(); assert.equal((await h.handler(post({}))).status, 400);
  assert.equal((await h.handler(post(callback(), '?key=short'))).status, 401);
  assert.equal(h.tables.team_payment_provider_events.length, 0);
  const failed = fixture(undefined, { lookupFailure: true });
  assert.equal((await failed.handler(post(callback()))).status, 503);
  assert.equal(failed.tables.team_payment_provider_events.length, 0);
});
