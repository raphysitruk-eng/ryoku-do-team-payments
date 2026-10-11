-- Stop collecting identity numbers and birth dates. Legacy values are left untouched.
-- New registrations omit both columns and only save the requested student/contact details.
alter table public.grade_exam_registrations alter column national_id drop not null;
alter table public.grade_exam_registrations alter column birth_date drop not null;

