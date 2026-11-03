-- ทดสอบกลุ่มคะแนน: RLS + student_report ส่ง groups/group_id
\set ON_ERROR_STOP on
insert into auth.users values
  ('55555555-5555-5555-5555-555555555555', 'e@test'),
  ('66666666-6666-6666-6666-666666666666', 'f@test');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', false);
insert into terms (academic_year, semester) values (2569, 1) returning id \gset term_
insert into classrooms (term_id, grade, room) values (:'term_id', 'ม.3', '1') returning id \gset room_
insert into students (term_id, classroom_id, number, first_name) values (:'term_id', :'room_id', 1, 'เอ') returning access_code \gset s_
insert into subjects (term_id, name) values (:'term_id', 'ไทย') returning id \gset sub_
insert into subject_classrooms (subject_id, classroom_id, term_id) values (:'sub_id', :'room_id', :'term_id');
insert into score_groups (subject_id, name, max_score) values (:'sub_id', 'สมุด', 20) returning id \gset g_
insert into assignments (subject_id, title, max_score, group_id) values (:'sub_id', 'สมุด 1', 5, :'g_id') returning id \gset a_

reset role;
set role anon;
select set_config('request.jwt.claims', '{}', false);
select student_report(:'s_access_code') as r \gset
select 'report has groups', (:'r'::jsonb #>> '{subjects,0,groups,0,name}') = 'สมุด' as ok;
select 'report has group_id', (:'r'::jsonb #>> '{subjects,0,assignments,0,group_id}') = :'g_id' as ok;

reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666"}', false);
select 'other teacher sees no groups', count(*) = 0 as ok from score_groups;

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', false);
delete from score_groups where id = :'g_id';
select 'deleting group keeps assignment', group_id is null as ok from assignments where id = :'a_id';
reset role;
