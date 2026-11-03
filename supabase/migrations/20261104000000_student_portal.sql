-- =====================================================================
-- KengScore : ให้นักเรียนดูคะแนนของตัวเอง
-- นักเรียนแต่ละคนมี "รหัสดูคะแนน" 8 ตัวอักษร (สุ่ม เดาไม่ได้)
-- นักเรียนไม่ต้องมีบัญชี: ส่งรหัสให้ฟังก์ชัน student_report แล้วได้เฉพาะคะแนนของตัวเอง
-- รันต่อจาก 20261103000000_init.sql
-- =====================================================================

-- สุ่มรหัส 8 ตัว จากอักษรที่ไม่สับสนกัน (ไม่มี I L O 0 1) → 31^8 ≈ 8.5 × 10^11 แบบ
create or replace function public.gen_access_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  i int;
  code text := '';
begin
  -- ใช้เฉพาะไบต์ที่สุ่มเต็ม 8 บิต (ไบต์ 6 และ 8 ของ UUID v4 มีบิตคงที่)
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
    code := code || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return code;
end;
$$;

alter table public.students
  add column access_code text not null default public.gen_access_code();
create unique index students_access_code_key on public.students (access_code);

-- ครูเปิด/ปิดการดูคะแนนของนักเรียนได้
alter table public.settings
  add column portal_enabled boolean not null default true;

-- ครูสร้างรหัสใหม่ (เช่น รหัสหลุด) — ทำได้เฉพาะนักเรียนของตัวเองเพราะ RLS ยังทำงาน
create or replace function public.regenerate_access_codes(p_student_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.students
     set access_code = public.gen_access_code()
   where id = any (p_student_ids);
$$;
revoke execute on function public.regenerate_access_codes(uuid[]) from public, anon;
grant execute on function public.regenerate_access_codes(uuid[]) to authenticated;

-- หน้าคะแนนของนักเรียน: คืนข้อมูลเฉพาะนักเรียนที่ถือรหัสนี้
-- security definer = อ่านข้ามสิทธิ์ RLS ได้ แต่ฟังก์ชันจำกัดผลลัพธ์ไว้ที่นักเรียนคนเดียว
create or replace function public.student_report(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  s public.students%rowtype;
  st public.settings%rowtype;
  result jsonb;
begin
  if length(v_code) <> 8 then
    return null;
  end if;

  select * into s from public.students where access_code = v_code;
  if not found then
    return null;
  end if;

  select * into st from public.settings where owner_id = s.owner_id;
  if found and not st.portal_enabled then
    return jsonb_build_object('disabled', true);
  end if;

  select jsonb_build_object(
    'student', jsonb_build_object(
      'prefix', s.prefix,
      'first_name', s.first_name,
      'last_name', s.last_name,
      'number', s.number,
      'student_code', s.student_code,
      'grade', c.grade,
      'room', c.room
    ),
    'term', jsonb_build_object('academic_year', t.academic_year, 'semester', t.semester),
    'teacher_name', coalesce(st.teacher_name, ''),
    'school_name', coalesce(st.school_name, ''),
    'late_policy', st.late_policy,
    'categories', coalesce(to_jsonb(st.categories), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'code', sub.code,
          'name', sub.name,
          'color', sub.color,
          'full_score', sub.full_score,
          'assignments', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'category', a.category,
                'title', a.title,
                'max_score', a.max_score,
                'due_date', coalesce(dd.due_date, a.due_date),
                'late_policy', a.late_policy,
                'created_at', a.created_at,
                'submission', case
                  when sm.id is null then null
                  else jsonb_build_object(
                    'raw_score', sm.raw_score,
                    'submitted_on', sm.submitted_on,
                    'exempt', sm.exempt
                  )
                end
              )
              order by coalesce(dd.due_date, a.due_date), a.created_at
            )
            from public.assignments a
            left join public.assignment_due_dates dd
              on dd.assignment_id = a.id and dd.classroom_id = s.classroom_id
            left join public.submissions sm
              on sm.assignment_id = a.id and sm.student_id = s.id
            where a.subject_id = sub.id
          ), '[]'::jsonb)
        )
        order by sub.code, sub.name
      )
      from public.subjects sub
      join public.subject_classrooms sc
        on sc.subject_id = sub.id and sc.classroom_id = s.classroom_id
    ), '[]'::jsonb)
  )
  into result
  from public.classrooms c
  join public.terms t on t.id = c.term_id
  where c.id = s.classroom_id;

  return result;
end;
$$;
revoke execute on function public.student_report(text) from public;
grant execute on function public.student_report(text) to anon, authenticated;
