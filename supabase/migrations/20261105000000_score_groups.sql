-- =====================================================================
-- KengScore : รวมคะแนนเก็บย่อยเป็นคะแนนหลัก (กลุ่มคะแนน)
-- เช่น รวม "สมุด 1–10" เป็น "สมุด (ก่อนกลางภาค)" เต็ม 20
-- คะแนนกลุ่ม = (ผลรวมคะแนนที่ได้ ÷ ผลรวมคะแนนเต็ม) × คะแนนเต็มของกลุ่ม
-- รันต่อจาก 20261104000000_student_portal.sql
-- =====================================================================

create table public.score_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name       text not null,
  max_score  numeric(7, 2) not null check (max_score > 0),
  created_at timestamptz not null default now()
);
create index score_groups_subject_idx on public.score_groups (subject_id);
create index score_groups_owner_idx on public.score_groups (owner_id);

alter table public.score_groups enable row level security;
create policy "owner can do everything" on public.score_groups for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.score_groups from anon;
grant select, insert, update, delete on public.score_groups to authenticated;

-- งานแต่ละชิ้นอยู่ได้ไม่เกิน 1 กลุ่ม (ลบกลุ่ม → งานกลับเป็นงานเดี่ยว คะแนนไม่หาย)
alter table public.assignments
  add column group_id uuid references public.score_groups (id) on delete set null;
create index assignments_group_idx on public.assignments (group_id);
