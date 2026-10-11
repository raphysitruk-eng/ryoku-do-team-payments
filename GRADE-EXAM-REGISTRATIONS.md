# Grade exam registrations

Public registration: https://ryokudoacademy.com/grade-exams

The main academy Site hosts the branded Hebrew form. Its same-origin Worker sends validated requests to the authenticated `grade-exam-bridge` Edge Function. The bridge validates all fields again and calls service-only RPCs. The browser never receives a service key or bridge token. Only a SHA-256 token digest is committed in `auth.json`.

The fixed exam fee is 100 NIS. Accepted methods: Bit, PayBox, cash. The existing approved exam/equipment recipient is Raphy Sitruk, **054-476-8283**, with the existing Bit QR. The open-mat collection link is for 30 NIS and must not be used for exams.

Groups: beginners, advanced, youth, adults. Branches: Herzog, Agamim, Waldberg. Current belts: white, yellow, orange, green, blue. Current belt is intake information; registration/payment does not update the student's rank in the personal area.

For minors, a parent/guardian must register and consent. The form collects student identity and date of birth plus contact details; email is optional. Public receipts contain no identity or contact data. The three new tables have RLS enabled and no public policies or public grants. Intake is limited to 20 new submissions per source per hour; successful retries are resolved first. A request key prevents duplicate submissions. A salted identity hash prevents a second active registration for the same current belt and academic season. Staff can cancel a previous request before a repeat registration.

Registrations start `pending` with `awaiting_payment`. Participant reports only set `reported_unverified`. Cash is verified by staff after receipt. An approved administrator with AAL2 can list/filter registrations in the existing payment admin and update their status. Verification requires explicit confirmation and a recorded note; participation approval requires verified payment. Optimistic locking rejects stale edits. Updates are recorded in `grade_exam_audit`.

There are no automatic grade-exam emails or payment debits. Open-mat mail queues, admission approvals, standing orders and existing student ranks remain separate.

Checks: main Site `node scripts/grade-exam-smoke.mjs`; admin repository `node --test tests/grade-exam-admin.test.mjs tests/admin-request.test.mjs tests/invoice4u-ipn.test.mjs`; database `tests/grade-exams.test.sql` (all fixture writes are rolled back). The managed runtime does not provide a browser; mobile CSS, labels and form behaviour are checked in source and simulated DOM tests, not a physical-device browser test.
