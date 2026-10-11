import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { validateGradeExam, gradeExamUuid, gradeContactIdentity } from './grade-exam-model.js';
import auth from './auth.json' with { type: 'json' };

const out = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
function equalDigest(a: string, b: string) { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
function svc() {
  const secret = Deno.env.get('SUPABASE_SECRET_KEYS');
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (secret) { try { key = JSON.parse(secret).default || key; } catch {} }
  return createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const statuses: Record<string, number> = { INVALID: 400, KEY_CONFLICT: 409, DUPLICATE_REGISTRATION: 409, RATE_LIMITED: 429, NOT_FOUND: 404, CANCELLED: 409, CASH_PAYMENT: 400 };
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return out({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-f0-9]{64}$/.test(token) || !equalDigest(await digest(token), auth.token_sha256)) return out({ ok: false, code: 'UNAUTHORIZED' }, 401);
  if (!(req.headers.get('content-type') || '').includes('application/json')) return out({ ok: false, code: 'INVALID' }, 400);
  try {
    const raw = await req.text();
    if (raw.length > 8000) return out({ ok: false, code: 'INVALID' }, 413);
    const input = JSON.parse(raw);
    if (!gradeExamUuid.test(input.key || '')) return out({ ok: false, code: 'INVALID' }, 400);
    const keyHash = await digest('grade-exam-request:' + token + ':' + input.key);
    const s = svc(); let result;
    if (input.action === 'register') {
      const validation = validateGradeExam(input.payload || {});
      if (!validation.valid || !/^[a-f0-9]{64}$/.test(input.source_hash || '')) return out({ ok: false, code: 'INVALID' }, 400);
      result = await s.rpc('register_grade_exam_contact', { p_payload: validation.payload, p_key_hash: keyHash, p_payload_hash: await digest(JSON.stringify(validation.payload)), p_identity_hash: await digest('grade-exam-identity:' + token + ':' + gradeContactIdentity(validation.payload)), p_source_hash: input.source_hash });
    } else if (input.action === 'report') {
      if (!/^GE-[A-F0-9]{12}$/.test(input.reference || '') || typeof input.payment_reference !== 'string' || input.payment_reference.trim().length < 2 || input.payment_reference.trim().length > 100) return out({ ok: false, code: 'INVALID' }, 400);
      result = await s.rpc('report_grade_exam_payment', { p_reference: input.reference, p_key_hash: keyHash, p_payment_reference: input.payment_reference.trim() });
    } else if (input.action === 'status') {
      if (!/^GE-[A-F0-9]{12}$/.test(input.reference || '')) return out({ ok: false, code: 'INVALID' }, 400);
      const { data, error } = await s.from('grade_exam_registrations').select('reference,amount_agorot,payment_method,payment_status,registration_status,branch,group_name,current_rank').eq('reference', input.reference).eq('request_key_hash', keyHash).maybeSingle();
      if (error) throw error;
      return data ? out({ ok: true, registration: data }) : out({ ok: false, code: 'NOT_FOUND' }, 404);
    } else return out({ ok: false, code: 'INVALID' }, 400);
    if (result.error) throw result.error;
    if (!result.data?.ok) return out(result.data || { ok: false, code: 'TEMPORARY_FAILURE' }, statuses[result.data?.code] || 503);
    return out(result.data);
  } catch { return out({ ok: false, code: 'TEMPORARY_FAILURE' }, 503); }
});
