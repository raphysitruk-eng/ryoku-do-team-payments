export const GRADE_EXAM_FEE = 10000;
export const GRADE_EXAM_CONSENT_VERSION = '2026-10-11.1';
export const GRADE_EXAM_PHONE = '0544768283';
export const GRADE_EXAM_LABELS = Object.freeze({
  groups: { beginners: 'מתחילים', advanced: 'מתקדמים', youth: 'נוער', adults: 'בוגרים' },
  branches: { herzog: 'הרצוג', agamim: 'אגמים', waldberg: 'וולדנברג' },
  ranks: { white: 'לבן', yellow: 'צהוב', orange: 'כתום', green: 'ירוק', blue: 'כחול' },
  methods: { bit: 'Bit', paybox: 'PayBox', cash: 'מזומן' }
});
export const gradeExamUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const oneLine = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
export function israelDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validBirthDate(value, today = israelDate()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today && Number(value.slice(0, 4)) >= Number(today.slice(0, 4)) - 120;
}
export function isMinor(birthDate, today = israelDate()) {
  const eighteenth = `${Number(birthDate.slice(0, 4)) + 18}${birthDate.slice(4)}`;
  return eighteenth > today;
}
export function validNationalId(value) {
  if (!/^\d{9}$/.test(value) || value === '000000000') return false;
  return [...value].reduce((sum, digit, i) => { const n = Number(digit) * (i % 2 + 1); return sum + (n > 9 ? n - 9 : n); }, 0) % 10 === 0;
}
export function normalizeGradePhone(value) {
  let phone = String(value ?? '').replace(/[\s().-]/g, '');
  if (phone.startsWith('+972')) phone = '0' + phone.slice(4);
  if (phone.startsWith('972')) phone = '0' + phone.slice(3);
  return phone;
}
export function validateGradeExam(input, today = israelDate()) {
  const errors = {};
  const payload = {
    full_name: oneLine(input.full_name),
    national_id: String(input.national_id ?? '').trim().padStart(9, '0'),
    birth_date: String(input.birth_date ?? ''),
    registrant_kind: input.registrant_kind,
    contact_name: oneLine(input.contact_name),
    contact_phone: normalizeGradePhone(input.contact_phone),
    contact_email: String(input.contact_email ?? '').trim().toLowerCase(),
    group_name: input.group_name, branch: input.branch, current_rank: input.current_rank,
    payment_method: input.payment_method,
    accuracy_consent: input.accuracy_consent === true,
    guardian_consent: input.guardian_consent === true,
    consent_version: GRADE_EXAM_CONSENT_VERSION
  };
  if (payload.full_name.length < 2 || payload.full_name.length > 100) errors.full_name = 'מלאו את שם החניך/ה המלא.';
  if (!validNationalId(payload.national_id)) errors.national_id = 'הזינו תעודת זהות תקינה, כולל ספרת ביקורת.';
  if (!validBirthDate(payload.birth_date, today)) errors.birth_date = 'בחרו תאריך לידה תקין שאינו בעתיד.';
  if (!['self', 'guardian'].includes(payload.registrant_kind)) errors.registrant_kind = 'בחרו מי ממלא את הטופס.';
  if (validBirthDate(payload.birth_date, today) && isMinor(payload.birth_date, today) && (payload.registrant_kind !== 'guardian' || !payload.guardian_consent)) errors.guardian_consent = 'הרשמת חניך/ה מתחת לגיל 18 מחייבת מילוי ואישור של הורה או אפוטרופוס.';
  if (payload.registrant_kind === 'self') payload.contact_name = payload.full_name;
  if (payload.contact_name.length < 2 || payload.contact_name.length > 100) errors.contact_name = 'מלאו שם הורה או אפוטרופוס.';
  if (!/^0(?:5\d{8}|[23489]\d{7}|7\d{8})$/.test(payload.contact_phone)) errors.contact_phone = 'הזינו מספר טלפון ישראלי תקין.';
  if (payload.contact_email && (payload.contact_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact_email))) errors.contact_email = 'בדקו את כתובת האימייל.';
  for (const [field, labels] of [['group_name', GRADE_EXAM_LABELS.groups], ['branch', GRADE_EXAM_LABELS.branches], ['current_rank', GRADE_EXAM_LABELS.ranks], ['payment_method', GRADE_EXAM_LABELS.methods]]) {
    if (!Object.hasOwn(labels, payload[field])) errors[field] = 'בחרו אפשרות מהרשימה.';
  }
  if (!payload.accuracy_consent) errors.accuracy_consent = 'יש לאשר את נכונות הפרטים ואת תנאי ההרשמה.';
  return { payload, errors, valid: Object.keys(errors).length === 0 };
}
