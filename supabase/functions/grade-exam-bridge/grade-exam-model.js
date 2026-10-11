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
export function gradeContactIdentity(payload) {
  return oneLine(payload.full_name).normalize('NFKC').toLowerCase() + '\u001f' + normalizeGradePhone(payload.contact_phone);
}
export function normalizeGradePhone(value) {
  let phone = String(value ?? '').replace(/[\s().-]/g, '');
  if (phone.startsWith('+972')) phone = '0' + phone.slice(4);
  if (phone.startsWith('972')) phone = '0' + phone.slice(3);
  return phone;
}
export function validateGradeExam(input) {
  const errors = {};
  const payload = {
    full_name: oneLine(input.full_name),
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
  if (!['self', 'guardian'].includes(payload.registrant_kind)) errors.registrant_kind = 'בחרו מי ממלא את הטופס.';
  if (payload.registrant_kind === 'guardian' && !payload.guardian_consent) errors.guardian_consent = 'יש לאשר את ההרשמה כהורה או אפוטרופוס.';
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
