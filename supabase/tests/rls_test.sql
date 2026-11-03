-- ทดสอบว่าผู้สอนแต่ละคนเห็นเฉพาะข้อมูลของตัวเอง
\set ON_ERROR_STOP on
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'a@test'),
  ('22222222-2222-2222-2222-222222222222', 'b@test');

-- ===== ครู A สร้างข้อมูล =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);

insert into settings default values;
insert into terms (academic_year, semester) values (2569, 2) returning id \gset term_
update settings set active_term_id = :'term_id';
insert into classrooms (term_id, grade, room) values (:'term_id', 'ม.1', '1') returning id \gset room_
insert into students (term_id, classroom_id, number, student_code, prefix, first_name, last_name)
  values (:'term_id', :'room_id', 1, '10001', 'ด.ช.', 'ทดสอบ', 'หนึ่ง') returning id \gset stu_
insert into subjects (term_id, code, name) values (:'term_id', 'ว21102', 'วิทยาศาสตร์') returning id \gset sub_
insert into subject_classrooms (subject_id, classroom_id, term_id) values (:'sub_id', :'room_id', :'term_id');
insert into assignments (subject_id, category, title, max_score, due_date)
  values (:'sub_id', 'ใบงาน', 'ใบงานที่ 1', 10, '2026-11-02') returning id \gset asg_
insert into assignment_due_dates (assignment_id, classroom_id, due_date) values (:'asg_id', :'room_id', '2026-11-03');
insert into submissions (assignment_id, student_id, raw_score, submitted_on)
  values (:'asg_id', :'stu_id', 9, '2026-11-05');

-- upsert แบบที่ client ใช้ (on conflict assignment_id, student_id)
insert into submissions (assignment_id, student_id, raw_score, submitted_on)
  values (:'asg_id', :'stu_id', 10, '2026-11-05')
  on conflict (assignment_id, student_id) do update set raw_score = excluded.raw_score;

select 'A sees own submissions' as check, count(*) = 1 as ok from submissions;
select 'settings defaults', categories[1] = 'สมุด' and (late_policy->>'amount')::int = 10 as ok from settings;

-- ===== ครู B ต้องไม่เห็นอะไรของ A =====
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', false);
select 'B sees no terms' as check, count(*) = 0 as ok from terms;
select 'B sees no students', count(*) = 0 as ok from students;
select 'B sees no submissions', count(*) = 0 as ok from submissions;
select 'B sees no settings', count(*) = 0 as ok from settings;

-- B แก้/ลบของ A ไม่ได้ (ไม่มีแถวที่มองเห็น)
with u as (update submissions set raw_score = 0 returning 1) select 'B update affects 0', count(*) = 0 as ok from u;
with d as (delete from students returning 1) select 'B delete affects 0', count(*) = 0 as ok from d;

-- B ปลอม owner_id เป็น A ไม่ได้
do $$ begin
  insert into terms (owner_id, academic_year, semester) values ('11111111-1111-1111-1111-111111111111', 2570, 1);
  raise exception 'FAIL: B inserted a row owned by A';
exception when insufficient_privilege then
  raise notice 'ok: B cannot insert rows owned by A';
end $$;

-- ===== anon ไม่มีสิทธิ์เลย =====
reset role;
set role anon;
do $$ begin
  perform 1 from students;
  raise exception 'FAIL: anon can read students';
exception when insufficient_privilege then
  raise notice 'ok: anon cannot read students';
end $$;

-- ===== ความถูกต้องของความสัมพันธ์ =====
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);
insert into terms (academic_year, semester) values (2570, 1) returning id \gset term2_
do $$ begin
  -- นักเรียนต้องอยู่ห้องในภาคเรียนเดียวกัน
  insert into students (term_id, classroom_id, first_name)
    select t.id, c.id, 'ผิดภาค' from terms t, classrooms c where t.academic_year = 2570 limit 1;
  raise exception 'FAIL: student linked to classroom of another term';
exception when foreign_key_violation then
  raise notice 'ok: student/classroom term mismatch rejected';
end $$;

-- ลบภาคเรียน → ข้อมูลลูกหายตาม และ active_term_id กลายเป็น null
delete from terms where id = :'term_id';
select 'cascade delete term', (select count(*) from submissions) = 0
  and (select count(*) from students) = 0
  and (select active_term_id from settings) is null as ok;
