-- ทดสอบหน้าคะแนนของนักเรียน (student_report) และรหัสดูคะแนน
\set ON_ERROR_STOP on
insert into auth.users values
  ('33333333-3333-3333-3333-333333333333', 'c@test'),
  ('44444444-4444-4444-4444-444444444444', 'd@test');

-- ===== ครู C เตรียมข้อมูล: 2 นักเรียนในห้องเดียวกัน =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', false);
insert into settings (teacher_name) values ('ครูซี');
insert into terms (academic_year, semester) values (2569, 2) returning id \gset term_
insert into classrooms (term_id, grade, room) values (:'term_id', 'ม.2', '3') returning id \gset room_
insert into students (term_id, classroom_id, number, student_code, first_name)
  values (:'term_id', :'room_id', 1, '50001', 'หนึ่ง') returning id \gset s1_
insert into students (term_id, classroom_id, number, student_code, first_name)
  values (:'term_id', :'room_id', 2, '50002', 'สอง') returning id \gset s2_
insert into subjects (term_id, code, name) values (:'term_id', 'ค22102', 'คณิต') returning id \gset sub_
insert into subject_classrooms (subject_id, classroom_id, term_id) values (:'sub_id', :'room_id', :'term_id');
insert into assignments (subject_id, title, max_score, due_date) values (:'sub_id', 'งาน 1', 10, '2026-11-02') returning id \gset a1_
insert into assignments (subject_id, title, max_score, due_date) values (:'sub_id', 'งาน 2', 5, '2026-11-04') returning id \gset a2_
insert into assignment_due_dates (assignment_id, classroom_id, due_date) values (:'a2_id', :'room_id', '2026-11-06');
insert into submissions (assignment_id, student_id, raw_score, submitted_on, note)
  values (:'a1_id', :'s1_id', 8.5, '2026-11-03', 'โน้ตลับของครู');
insert into submissions (assignment_id, student_id, raw_score, submitted_on)
  values (:'a1_id', :'s2_id', 3, '2026-11-02');
select access_code as code1 from students where id = :'s1_id' \gset
select access_code as code2 from students where id = :'s2_id' \gset

select 'codes are 8 chars from safe alphabet' as check,
  :'code1' ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$' and :'code1' <> :'code2' as ok;

-- ===== นักเรียน (anon) ดูคะแนนตัวเอง =====
reset role;
set role anon;
select set_config('request.jwt.claims', '{}', false);
select student_report(lower(substr(:'code1', 1, 4)) || '-' || substr(:'code1', 5)) as r \gset
select 'anon gets own report (code is case/dash tolerant)' as check,
  (:'r'::jsonb #>> '{student,first_name}') = 'หนึ่ง' as ok;
select 'report has class + teacher', (:'r'::jsonb #>> '{student,grade}') = 'ม.2'
  and (:'r'::jsonb ->> 'teacher_name') = 'ครูซี' as ok;
select 'only own submission is included',
  (:'r'::jsonb #>> '{subjects,0,assignments,0,submission,raw_score}')::numeric = 8.5
  and (:'r'::jsonb #> '{subjects,0,assignments,1,submission}') = 'null'::jsonb as ok;
select 'per-room due date applied', (:'r'::jsonb #>> '{subjects,0,assignments,1,due_date}') = '2026-11-06' as ok;
select 'teacher note is not exposed', position('โน้ตลับ' in :'r') = 0 as ok;
select 'other student ids not exposed', position(:'s2_id' in :'r') = 0 as ok;
select 'wrong code → null', student_report('ABCD-EFGH') is null as ok;
select 'short code → null', student_report('ABC') is null as ok;

-- anon ยังอ่านตารางตรง ๆ ไม่ได้ และสร้างรหัสใหม่ไม่ได้
do $$ begin
  perform 1 from students;
  raise exception 'FAIL: anon can read students';
exception when insufficient_privilege then
  raise notice 'ok: anon cannot read students';
end $$;
do $$ begin
  perform regenerate_access_codes(array[gen_random_uuid()]);
  raise exception 'FAIL: anon can regenerate codes';
exception when insufficient_privilege then
  raise notice 'ok: anon cannot regenerate codes';
end $$;

-- ===== ครู D สร้างรหัสใหม่ให้นักเรียนของ C ไม่ได้ =====
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', false);
select regenerate_access_codes(array[:'s1_id'::uuid]);
reset role;
select 'other teacher cannot regenerate', (select access_code from students where id = :'s1_id') = :'code1' as ok;

-- ===== ครู C สร้างรหัสใหม่ → รหัสเก่าใช้ไม่ได้ =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', false);
select regenerate_access_codes(array[:'s1_id'::uuid]);
reset role;
set role anon;
select 'old code stops working after regenerate', student_report(:'code1') is null as ok;

-- ===== ครูปิดการดูคะแนน =====
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', false);
update settings set portal_enabled = false;
reset role;
set role anon;
select 'portal disabled', student_report(:'code2') = '{"disabled": true}'::jsonb as ok;
