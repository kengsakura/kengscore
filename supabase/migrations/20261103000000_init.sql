-- =====================================================================
-- KengScore : ระบบบันทึกคะแนนการส่งงาน
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (ครั้งเดียว)
-- ข้อมูลทุกตารางแยกตามผู้สอน (owner_id) และป้องกันด้วย Row Level Security
-- =====================================================================

-- ---------- ภาคเรียน / ปีการศึกษา ----------
create table public.terms (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  academic_year int  not null check (academic_year between 2400 and 2800), -- พ.ศ.
  semester      smallint not null check (semester between 1 and 3),         -- 3 = ภาคฤดูร้อน
  created_at    timestamptz not null default now(),
  unique (owner_id, academic_year, semester)
);

-- ---------- ตั้งค่าของผู้สอน (1 แถวต่อ 1 คน) ----------
create table public.settings (
  owner_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  active_term_id uuid references public.terms (id) on delete set null,
  teacher_name   text not null default '',
  school_name    text not null default '',
  categories     text[] not null default array['สมุด', 'ใบงาน', 'สอบเก็บคะแนน', 'ชิ้นงาน'],
  -- นโยบายหักคะแนนส่งช้า (ค่าเริ่มต้น) ดู src/lib/scoring.ts
  late_policy    jsonb not null default
    '{"mode":"percent","amount":10,"per":"day","grace":0,"floor":50,"weekdaysOnly":true,"round":"none"}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- ---------- ห้องเรียน (ชั้น + ห้อง) แยกตามภาคเรียน ----------
create table public.classrooms (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term_id    uuid not null references public.terms (id) on delete cascade,
  grade      text not null,   -- ชั้น เช่น ม.1
  room       text not null,   -- ห้อง เช่น 2
  created_at timestamptz not null default now(),
  unique (term_id, grade, room),
  unique (id, term_id)
);

-- ---------- นักเรียน ----------
create table public.students (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term_id      uuid not null,
  classroom_id uuid not null,
  number       int,                          -- เลขที่
  student_code text not null default '',     -- เลขประจำตัว
  prefix       text not null default '',     -- คำนำหน้า
  first_name   text not null,
  last_name    text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- นักเรียนต้องอยู่ห้องที่อยู่ในภาคเรียนเดียวกัน
  foreign key (classroom_id, term_id) references public.classrooms (id, term_id) on delete cascade
);
create unique index students_term_code_key on public.students (term_id, student_code) where student_code <> '';
create index students_classroom_idx on public.students (classroom_id, number);
create index students_term_idx on public.students (term_id);

-- ---------- รายวิชา ----------
create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term_id    uuid not null references public.terms (id) on delete cascade,
  code       text not null default '',   -- รหัสวิชา เช่น ว21102
  name       text not null,
  color      text not null default 'indigo',
  full_score numeric(7, 2) check (full_score is null or full_score > 0), -- คะแนนเก็บเต็ม (ใช้แปลงสัดส่วน)
  created_at timestamptz not null default now(),
  unique (id, term_id)
);
create index subjects_term_idx on public.subjects (term_id);

-- ---------- รายวิชา ↔ ห้องที่สอน ----------
create table public.subject_classrooms (
  subject_id   uuid not null,
  classroom_id uuid not null,
  term_id      uuid not null,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (subject_id, classroom_id),
  foreign key (subject_id, term_id) references public.subjects (id, term_id) on delete cascade,
  foreign key (classroom_id, term_id) references public.classrooms (id, term_id) on delete cascade
);
create index subject_classrooms_classroom_idx on public.subject_classrooms (classroom_id);

-- ---------- งาน / ชิ้นงาน ----------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  category    text not null default 'ใบงาน',  -- ประเภทงาน
  title       text not null,                   -- ชื่องาน
  max_score   numeric(7, 2) not null default 10 check (max_score > 0),
  due_date    date not null default (now() at time zone 'Asia/Bangkok')::date, -- กำหนดส่ง
  late_policy jsonb,                           -- null = ใช้ค่าเริ่มต้นจาก settings
  created_at  timestamptz not null default now()
);
create index assignments_subject_idx on public.assignments (subject_id, due_date);

-- ---------- กำหนดส่งเฉพาะห้อง (ถ้าแต่ละห้องเรียนคนละวัน) ----------
create table public.assignment_due_dates (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  classroom_id  uuid not null references public.classrooms (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  due_date      date not null,
  primary key (assignment_id, classroom_id)
);
create index assignment_due_dates_classroom_idx on public.assignment_due_dates (classroom_id);

-- ---------- การส่งงาน / คะแนน ----------
create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  raw_score     numeric(7, 2) not null check (raw_score >= 0),  -- คะแนนที่ทำได้ (ก่อนหักส่งช้า)
  submitted_on  date not null default (now() at time zone 'Asia/Bangkok')::date, -- วันที่ส่ง
  exempt        boolean not null default false,                 -- ยกเว้นการหักคะแนนส่งช้า
  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index submissions_student_idx on public.submissions (student_id);

-- ---------- updated_at อัตโนมัติ ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security : เห็น/แก้ได้เฉพาะข้อมูลของตัวเอง ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'terms', 'settings', 'classrooms', 'students', 'subjects',
    'subject_classrooms', 'assignments', 'assignment_due_dates', 'submissions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (owner_id)', t || '_owner_idx', t);
    execute format(
      'create policy "owner can do everything" on public.%I for all to authenticated '
      'using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;
