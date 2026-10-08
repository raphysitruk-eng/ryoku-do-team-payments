import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';

const source = stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/team-payment-invoice4u-ipn/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, ''));
const now = Date.parse('2026-10-08T05:18:00Z');
const requestRow = (changes = {}) => ({
  id: 'request-a', parent_phone_normalized: '0500000001', parent_email_normalized: 'registered@example.com',
  request_status: 'payment_pending', payment_status: 'not_started', amount_agorot: 15000,
  number_of_cycles: 9, checkout_started_at: new Date(now - 2 * 60000).toISOString(), ...changes
});

function fixture(requests = [requestRow()], options = {}) {
  const tables = { team_payment_requests: structuredClone(requests), team_payment_provider_events: [], team_payment_rate_limits: [], team_payment_provider_secrets: [] };
  const writes = [], errors = [], rpcCalls=[];
  if(options.pathSecret)tables.team_payment_provider_secrets.push({id:'secret-a',active:true,provider:'invoice4u',purpose:'invoice4u_ipn_path',secret_hash:createHash('sha256').update(options.pathSecret).digest('hex')});
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
          if(this.table==='team_payment_provider_events'&&tables[this.table].some(row=>row.event_key===this.value.event_key))return Promise.resolve({data:null,error:{code:'23505'}}).then(resolve,reject);
          const value = structuredClone(this.value); writes.push({ table: this.table, mode: this.mode, value });
          const inserted={ id: 'event-' + writes.length, ...value };tables[this.table].push(inserted);
          return Promise.resolve({data:this.single?inserted:[inserted],error:null}).then(resolve,reject);
        } else if (this.mode === 'update') {
          writes.push({ table: this.table, mode: this.mode, value: structuredClone(this.value) });
          for (const row of rows) Object.assign(row, this.value);
        }
        return Promise.resolve({ data: this.single ? rows[0] || null : rows, error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    }
  }
  let handler;
  class FixedDate extends Date { constructor(...args){super(...(args.length?args:[now]))} static now() { return now; } }
  const client={from:name=>new Query(name),rpc:async(name,args)=>{rpcCalls.push({name,args});return options.rpcFailure?{data:null,error:{message:'database unavailable'}}:{data:{processing_status:'processed'},error:null}}};
  const context = vm.createContext({
    Date: FixedDate, TextEncoder, TextDecoder, atob, URL, URLSearchParams, Request, Response, crypto: webcrypto,
    console: { error: (...args) => errors.push(args) }, createClient: () => client,
    Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-key' : undefined }, serve: fn => { handler = fn; } }
  });
  vm.runInContext(source, context);
  return { tables, writes, errors, rpcCalls, context, handler, match: (phone, email, amount = 15000, duration = 9) => context.matchUnique({ from: name => new Query(name) }, phone, email, amount, duration) };
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

const pathSecret='a'.repeat(96);
function monthly(changes={}){return {sum:'150',clientName:'הורה לדוגמה',clientPhone:'0500000001',clientEmail:'payer@example.com',standingOrderId:'150877',isSuccessClearing:'true',isSuccessDocCreation:'true',paymentsNum:'150',failureClearingMessage:'',failureDocCreationMessage:'',...changes}}
function rawPost(body,suffix='',contentType='application/x-www-form-urlencoded'){return new Request('https://example.com/ipn'+suffix,{method:'POST',headers:{'content-type':contentType},body})}

test('bare Base64 monthly bodies preserve UTF-8 Hebrew, plus signs, and padding despite form content type',async()=>{
  const value=monthly({clientName:'אב ₪ 🥋',failureDocCreationMessage:'מסמך לא הופק'});
  const encoded=Buffer.from(JSON.stringify(value),'utf8').toString('base64');
  const h=fixture();const parsed=await h.context.parsePayload(rawPost(encoded));
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)),value);
  const response=await h.handler(rawPost(encoded));assert.equal(response.status,200);
  const event=h.tables.team_payment_provider_events[0];
  assert.equal(event.normalized_payload.kind,'invoice4u_monthly_charge');assert.equal(event.normalized_payload.success,true);
  assert.equal(event.normalized_payload.standing_order_amount_agorot,15000);
  assert.equal(event.normalized_payload.actual_amount_agorot,null);assert.equal(event.payment_status,null);assert.equal(h.rpcCalls.length,0);
});

test('API setup Data JSON is unwrapped and card or encoded metadata is never retained',async()=>{
  const h=fixture(),value={Success:'True',CustomerPhone:'0500000001',CustomerMail:'registered@example.com',Amount:'150',standingOrderId:'150877',PaymentId:'setup-only',cardSuffix:'1234',ownerId:'payer-id'};
  const response=await h.handler(post({Data:JSON.stringify(value)}));assert.equal(response.status,200);
  const event=h.tables.team_payment_provider_events[0];
  assert.equal(event.normalized_payload.kind,'invoice4u_api_setup');assert.equal(event.normalized_payload.success,true);
  assert.equal(event.raw_payload.cardSuffix,'[REDACTED]');assert.equal(event.raw_payload.ownerId,'[REDACTED]');assert.equal(event.raw_payload.Data,undefined);
  assert.equal(h.rpcCalls.length,0);assert.equal(event.verification_status,'unverified');
});

test('only a valid stable path credential can submit a callback for transactional processing',async()=>{
  const h=fixture([],{pathSecret});
  const response=await h.handler(rawPost(Buffer.from(JSON.stringify(monthly())).toString('base64'),'/notify/'+pathSecret));
  assert.equal(response.status,200);assert.equal((await response.json()).processing_status,'processed');
  assert.equal(h.tables.team_payment_provider_events[0].verification_status,'verified');
  assert.equal(h.rpcCalls.length,1);assert.equal(h.rpcCalls[0].name,'team_payment_apply_invoice4u_event');
  assert.equal(h.rpcCalls[0].args.p_event_id,h.tables.team_payment_provider_events[0].id);
  assert.ok(h.writes.every(w=>w.table!=='team_payment_requests'));
  for(const suffix of ['/notify/'+('b'.repeat(96)),'/notify/short','/notify/'+pathSecret+'/extra']){
    const bad=fixture([],{pathSecret});assert.equal((await bad.handler(post(monthly(),suffix))).status,401);assert.equal(bad.rpcCalls.length,0);assert.equal(bad.tables.team_payment_provider_events.length,0);
  }
});

test('an unsigned forged success never reaches financial processing, including known recurring IDs',async()=>{
  const h=fixture([requestRow({provider_recurring_id:'150877'})]);const before=structuredClone(h.tables.team_payment_requests);
  assert.equal((await h.handler(post(monthly()))).status,200);assert.equal(h.rpcCalls.length,0);
  assert.deepEqual(h.tables.team_payment_requests,before);assert.equal(h.tables.team_payment_provider_events[0].payment_status,null);
});

test('durable authenticated captures are queued for local retry after a database processing failure',async()=>{
  const h=fixture([],{pathSecret,rpcFailure:true});
  const response=await h.handler(post(monthly(),'/notify/'+pathSecret));
  assert.equal(response.status,200);assert.equal((await response.json()).queued,true);
  const event=h.tables.team_payment_provider_events[0];assert.equal(event.processing_status,'received');
  assert.equal(event.error_message,'PROCESSING_RETRY_REQUIRED');assert.ok(event.next_retry_at);
});

test('authenticated replay reuses the captured event and unsigned traffic cannot poison its key',async()=>{
  const h=fixture([],{pathSecret});
  await h.handler(post(monthly()));await h.handler(post(monthly(),'/notify/'+pathSecret));
  const replay=await h.handler(post(monthly(),'/notify/'+pathSecret));
  assert.equal((await replay.json()).duplicate,true);assert.equal(h.tables.team_payment_provider_events.length,2);
  assert.equal(h.rpcCalls[0].args.p_event_id,h.rpcCalls[1].args.p_event_id);
});

test('charge and document outcomes are independent and paymentsNum is not treated as a cycle count',()=>{
  const h=fixture(),n=h.context.normalizedEvent(monthly({isSuccessDocCreation:'false',failureDocCreationMessage:'מסמך לא הופק'}));
  assert.equal(n.success,true);assert.equal(n.document_success,false);assert.equal(n.standing_order_duration,null);assert.equal(n.actual_amount_agorot,null);
  assert.equal(h.context.normalizedEvent(monthly({isSuccessClearing:'false'})).success,false);
  assert.equal(h.context.normalizedEvent(monthly({isSuccessClearing:'yes'})).success,null);
});

test('conflicting wrappers, canonical keys and malformed JSON are rejected before capture',async()=>{
  for(const req of [post({Data:JSON.stringify(monthly()),sum:'1'}),post({sum:'150',Sum:'1'}),rawPost('{broken','', 'application/json')]){
    const h=fixture();assert.equal((await h.handler(req)).status,400);assert.equal(h.tables.team_payment_provider_events.length,0);assert.equal(h.rpcCalls.length,0);
  }
});

test('body size limits apply to actual bytes even when content-length is missing',async()=>{
  const h=fixture();const response=await h.handler(rawPost('x'.repeat(65537)));
  assert.equal(response.status,413);assert.equal(h.tables.team_payment_provider_events.length,0);
});
