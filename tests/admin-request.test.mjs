import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const adminSource = fs.readFileSync(new URL('admin.js', root), 'utf8');
const apiSource = stripTypeScriptTypes(fs.readFileSync(new URL('supabase/functions/team-payment-api-v2/index.ts', root), 'utf8').replace(/^import .*;\s*$/gm, ''));
const settings = {
  id: 1, season_label: '2026/27', checkout_mode: 'static_product', monthly_amount_agorot: 15000,
  billing_start_date: '2026-10-01', billing_end_date: '2027-06-30', number_of_cycles: 9,
  provider_checkout_url: 'https://private.invoice4u.co.il/test-product', terms_version: 'test-terms',
  cancellation_notice_days: 30, price_change_notice_days: 30, link_expiry_days: 14
};
const people = [
  { child_id: 'child-a', student_name: 'חניך ראשון', branch: 'הרצוג', group_name: 'נבחרת', parent: { full_name: 'הורה ראשון', phone: '+972500000001', email: 'first@example.com' } },
  { child_id: 'child-b', student_name: 'חניך שני', branch: 'אגמים', group_name: 'נבחרת צעירה', parent: { full_name: 'הורה שני', phone: '+972500000002', email: 'second@example.com' } }
];

class Element {
  constructor(id, document) {
    this.id = id; this.document = document; this.attributes = new Map(); this.options = [];
    this.disabled = false; this.readOnly = false; this.checked = false; this._value = ''; this._html = '';
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
      toggle: (value, force) => { const add = force ?? !classes.has(value); if (add) classes.add(value); else classes.delete(value); }
    };
  }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
  set textContent(value) { this._html = String(value); }
  get textContent() { return this._html.replace(/<[^>]*>/g, ''); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  removeAttribute(key) { this.attributes.delete(key); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  appendChild(option) { this.options.push(option); }
  focus() { this.document.activeElement = this; }
}

function frontend(responseForCreate) {
  const elements = new Map(), calls = [], alerts = [];
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(id, document)); return elements.get(id); },
    createElement() { return new Element('', document); }, querySelectorAll() { return []; }, activeElement: null
  };
  const el = id => document.getElementById(id);
  el('cBranch').options = ['', 'הרצוג', 'אגמים', 'וולדנברג', 'בית שמש', 'אחר'].map(value => ({ value }));
  el('createModal').classList.add('hidden'); el('shareModal').classList.add('hidden');
  const context = vm.createContext({
    document, console, URL, URLSearchParams, setTimeout, clearTimeout, location: { hash: '', pathname: '/admin.html', search: '' },
    history: { replaceState() {} }, alert: value => alerts.push(value), confirm: () => true,
    navigator: { clipboard: { writeText: async () => {} } }, sessionStorage: {}, open() {},
    supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }) },
    __settings: structuredClone(settings), __loads: 0,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      let response = { status: 200, body: { ok: true } };
      if (body.action === 'admin_people') response.body.people = structuredClone(people);
      if (body.action === 'admin_create') {
        response = responseForCreate ? await responseForCreate(body) : {
          status: 200, body: { ok: true, token: 'test-invitation', request: { ...body, id: 'request-' + calls.length, amount_agorot: 15000 } }
        };
      }
      return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
    }
  });
  context.window = context;
  vm.runInContext(adminSource, context);
  vm.runInContext('settingsCfg=__settings; load=async()=>{__loads++;};', context);
  return { context, el, calls, alerts, document };
}
function fillManual(h, changes = {}) {
  const values = { cStudent: 'חניך לדוגמה', cParent: 'הורה לדוגמה', cPhone: '0500000001', cEmail: 'parent@example.com', cBranch: 'הרצוג', cGroup: 'נבחרת', ...changes };
  for (const [id, value] of Object.entries(values)) h.el(id).value = value;
}

test('opening a new request clears the previous child, parent, branch and errors while retaining season prices', async () => {
  const h = frontend();
  fillManual(h); h.el('cExisting').value = 'child-a'; h.el('createMsg').innerHTML = '<div>previous error</div>';
  h.el('cPhone').setAttribute('aria-invalid', 'true');
  await h.el('newBtn').onclick();
  for (const id of ['cExisting', 'cStudent', 'cGroup', 'cBranch', 'cParent', 'cPhone', 'cEmail']) assert.equal(h.el(id).value, '', id);
  assert.equal(h.el('createMsg').textContent, ''); assert.equal(h.el('cPhone').getAttribute('aria-invalid'), null);
  assert.equal(h.el('cAmount').value, '150'); assert.equal(h.el('cEnd').value, '2027-06-30'); assert.equal(h.el('cAmount').readOnly, true);
  await h.el('newBtn').onclick();
  assert.equal(h.calls.filter(x => x.action === 'admin_people').length, 2, 'refresh the cached child list on each new request');
});

test('switching from a selected child to manual entry clears all child and parent details', async () => {
  const h = frontend(); await h.el('newBtn').onclick();
  h.el('cExisting').value = 'child-a'; h.el('cExisting').onchange();
  assert.equal(h.el('cStudent').value, people[0].student_name); assert.equal(h.el('cPhone').value, people[0].parent.phone);
  h.el('cExisting').value = ''; h.el('cExisting').onchange();
  for (const id of ['cStudent', 'cGroup', 'cBranch', 'cParent', 'cPhone', 'cEmail']) assert.equal(h.el(id).value, '');
});

test('two successive requests use separate child identities and share messages', async () => {
  const h = frontend();
  for (const person of people) {
    await h.el('newBtn').onclick(); h.el('cExisting').value = person.child_id; h.el('cExisting').onchange();
    await h.el('createBtn').onclick();
    assert.ok(h.el('shareMessage').value.includes(person.student_name)); assert.ok(h.el('shareMessage').value.includes(person.parent.full_name));
    assert.equal(h.el('cExisting').value, ''); assert.equal(h.el('cStudent').value, ''); assert.equal(h.el('cParent').value, '');
  }
  const requests = h.calls.filter(x => x.action === 'admin_create');
  assert.deepEqual(requests.map(x => x.child_id), ['child-a', 'child-b']);
  assert.deepEqual(requests.map(x => x.parent_phone), ['0500000001', '0500000002']);
  assert.ok(requests.every(x => !('amount_agorot' in x)), 'the server owns static-product financial settings');
  assert.ok(!h.el('shareMessage').value.includes(people[0].student_name));
});

test('phone and optional email errors identify the field without submitting a request', async () => {
  for (const [id, value] of [['cPhone', '123'], ['cEmail', 'not-an-email']]) {
    const h = frontend(); await h.el('newBtn').onclick(); fillManual(h, { [id]: value });
    await h.el('createBtn').onclick();
    assert.equal(h.calls.filter(x => x.action === 'admin_create').length, 0); assert.equal(h.el(id).getAttribute('aria-invalid'), 'true');
    assert.equal(h.document.activeElement, h.el(id)); assert.ok(h.el('createMsg').textContent.length > 10);
  }
  const h = frontend(); await h.el('newBtn').onclick(); fillManual(h, { cEmail: '', cPhone: '+972 50-000-0001' });
  await h.el('createBtn').onclick();
  assert.equal(h.calls.find(x => x.action === 'admin_create').parent_phone, '0500000001');
});

test('double clicks create only one request and controls recover after completion', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = frontend(async body => { await pending; return { status: 200, body: { ok: true, token: 'test-invitation', request: { ...body, id: 'one-request', amount_agorot: 15000 } } }; });
  await h.el('newBtn').onclick(); fillManual(h);
  const first = h.el('createBtn').onclick(); await h.el('createBtn').onclick();
  assert.equal(h.calls.filter(x => x.action === 'admin_create').length, 1); assert.equal(h.el('createBtn').disabled, true);
  assert.equal(h.el('createClose').disabled, true); assert.equal(h.el('newBtn').disabled, true);
  release(); await first;
  assert.equal(h.el('createBtn').disabled, false); assert.equal(h.el('createClose').disabled, false); assert.equal(h.el('newBtn').disabled, false);
  assert.equal(h.el('shareModal').classList.contains('hidden'), false);
});

test('server validation, duplicate and expired-login responses show actionable errors and retain entered data', async () => {
  for (const [code, field, expected] of [
    ['INVALID_INPUT', 'parent_email', 'האימייל'], ['INVALID_CHILD', 'child_id', 'אינו פעיל'],
    ['DUPLICATE_REQUEST', null, 'כבר קיימת בקשה'], ['UNAUTHORIZED', null, 'התחברו מחדש']
  ]) {
    const h = frontend(async () => ({ status: code === 'UNAUTHORIZED' ? 401 : 400, body: { code, field } }));
    await h.el('newBtn').onclick(); fillManual(h); await h.el('createBtn').onclick();
    assert.ok(h.el('createMsg').textContent.includes(expected), code); assert.equal(h.el('cStudent').value, 'חניך לדוגמה');
    assert.equal(h.el('createBtn').disabled, false);
    await h.el('newBtn').onclick(); assert.equal(h.el('createMsg').textContent, ''); assert.equal(h.el('cStudent').value, '');
  }
});

function backend() {
  const state = { requests: [], audit: [], children: [], profiles: [], config: structuredClone(settings) };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'select'; }
    select() { return this; } eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    neq(key, value) { this.filters.push(row => row[key] !== value); return this; } limit() { return this; }
    insert(value) { this.operation = 'insert'; this.value = value; return this; }
    async execute(single = false) {
      if (this.operation === 'insert') {
        const rows = Array.isArray(this.value) ? this.value : [this.value];
        const result = rows.map(row => ({ ...row, id: row.id || 'request-' + (state.requests.length + 1) }));
        if (this.table === 'team_payment_requests') state.requests.push(...result); else if (this.table === 'team_payment_audit_log') state.audit.push(...result);
        return { data: single ? result[0] : result, error: null };
      }
      const tables = { team_payment_settings: [state.config], profiles: [{ id: 'test-admin', role: 'admin', approval_status: 'approved' }, ...state.profiles], children: state.children, team_payment_requests: state.requests, team_payment_terms_versions: [] };
      const rows = (tables[this.table] || []).filter(row => this.filters.every(filter => filter(row)));
      return { data: single ? rows[0] || null : rows, error: null };
    }
    single() { return this.execute(true); } maybeSingle() { return this.execute(true); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  const client = { from: table => new Query(table), auth: { getUser: async () => ({ data: { user: { id: 'test-admin' } } }) } };
  let handler;
  const context = vm.createContext({
    console: { error() {} }, Request, Response, URL, TextEncoder, crypto: webcrypto, atob,
    createClient: () => client, Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'in-memory-test-client' : undefined }, serve: fn => { handler = fn; } }
  });
  vm.runInContext(apiSource, context);
  async function submit(input, aal = 'aal2') {
    const headers = { 'Content-Type': 'application/json' };
    if (aal) headers.Authorization = 'Bearer test.' + Buffer.from(JSON.stringify({ aal })).toString('base64url') + '.test';
    const response = await handler(new Request('https://test.invalid/team-payment-api-v2', { method: 'POST', headers, body: JSON.stringify(input) }));
    return { status: response.status, body: await response.json() };
  }
  return { state, submit };
}
const validRequest = { action: 'admin_create', student_name: 'חניך לדוגמה', parent_name: 'הורה לדוגמה', parent_phone: '0500000001', parent_email: 'parent@example.com', branch: 'הרצוג', group_name: 'נבחרת' };

test('backend creates successive requests and keeps static-product pricing under server control', async () => {
  const h = backend();
  const first = await h.submit({ ...validRequest, parent_phone: '+972 50-000-0001', amount_agorot: 1, billing_end_date: '2050-01-01', provider_checkout_url: 'https://invalid.example' });
  const second = await h.submit({ ...validRequest, student_name: 'חניך נוסף', parent_email: '' });
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(h.state.requests.length, 2);
  const saved = h.state.requests[0];
  assert.equal(saved.parent_phone, '0500000001'); assert.equal(saved.amount_agorot, 15000);
  assert.equal(saved.billing_end_date, '2027-06-30'); assert.equal(saved.number_of_cycles, 9);
  assert.equal(saved.provider_checkout_url, settings.provider_checkout_url); assert.equal(saved.payment_status, 'not_started');
  assert.ok(first.body.token.length === 64); assert.notEqual(first.body.token, second.body.token);
});

test('backend returns the invalid field before attempting to save', async () => {
  for (const [field, value] of [['student_name', 'א'], ['parent_name', 'ב'], ['parent_phone', '123456789'], ['parent_email', 'invalid-email']]) {
    const h = backend(); const result = await h.submit({ ...validRequest, [field]: value });
    assert.equal(result.status, 400); assert.equal(result.body.code, 'INVALID_INPUT'); assert.equal(result.body.field, field);
    assert.equal(h.state.requests.length, 0);
  }
});

test('backend keeps duplicate-request protection', async () => {
  const h = backend(); assert.equal((await h.submit(validRequest)).status, 200);
  const duplicate = await h.submit(validRequest);
  assert.equal(duplicate.status, 409); assert.equal(duplicate.body.code, 'DUPLICATE_REQUEST'); assert.equal(h.state.requests.length, 1);
});

test('backend rejects stale inactive child selections with a child-field error', async () => {
  const h = backend(); h.state.children.push({ id: 'inactive-child', parent_id: 'test-parent', active: false });
  const result = await h.submit({ ...validRequest, child_id: 'inactive-child' });
  assert.equal(result.status, 400); assert.equal(result.body.code, 'INVALID_CHILD'); assert.equal(result.body.field, 'child_id');
  assert.equal(h.state.requests.length, 0);
});

test('backend still requires an authenticated administrator with two-factor assurance', async () => {
  for (const aal of [null, 'aal1']) {
    const h = backend(); const result = await h.submit(validRequest, aal);
    assert.equal(result.status, 401); assert.equal(result.body.code, 'UNAUTHORIZED'); assert.equal(h.state.requests.length, 0);
  }
});
