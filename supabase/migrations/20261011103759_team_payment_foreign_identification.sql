-- Support nine-digit identifiers assigned to foreign residents.
-- Existing Israeli ID and passport values and access policies are preserved.
alter table public.children drop constraint children_student_id_format;
alter table public.children add constraint children_student_id_format check (
  student_id_type in ('israeli_id','foreign_id','passport') and (
    student_id_number is null
    or (student_id_type in ('israeli_id','foreign_id') and student_id_number ~ '^[0-9]{9}$')
    or (student_id_type='passport' and student_id_number ~ '^[A-Z0-9]{5,20}$')
  )
);
alter table public.team_payment_consents drop constraint team_payment_consents_document_types;
alter table public.team_payment_consents add constraint team_payment_consents_document_types check (
  student_id_type in ('israeli_id','foreign_id','passport') and parent_id_type in ('israeli_id','foreign_id','passport')
);
alter table public.team_payment_requests drop constraint team_payment_requests_document_types;
alter table public.team_payment_requests add constraint team_payment_requests_document_types check (
  student_id_type in ('israeli_id','foreign_id','passport') and parent_id_type in ('israeli_id','foreign_id','passport')
);
