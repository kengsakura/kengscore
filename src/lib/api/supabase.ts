import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizePolicy } from '../scoring'
import { normalizeReport } from '../report'
import type {
  Api,
  StudentReport,
  Assignment,
  Classroom,
  ScoreGroup,
  DueDate,
  Settings,
  Student,
  Subject,
  Submission,
  Term,
  UUID,
} from './types'

const env = import.meta.env
export const SUPABASE_URL = env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_KEY = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY)

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('ยังไม่ได้ตั้งค่า Supabase')
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

const PAGE = 1000
const ID_CHUNK = 60

type Res<T> = { data: T | null; error: unknown }

function ok<T>(res: Res<T>): T {
  if (res.error) throw res.error
  return res.data as T
}

/** ดึงข้อมูลทุกแถว (Supabase จำกัด 1000 แถวต่อครั้ง) */
async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<Res<T[]>>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const data = ok(await make(from, from + PAGE - 1)) ?? []
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const SETTINGS_COLS = 'active_term_id, teacher_name, school_name, categories, late_policy, portal_enabled'
const STUDENT_COLS = 'id, term_id, classroom_id, number, student_code, prefix, first_name, last_name, access_code'
const ASSIGNMENT_COLS = 'id, subject_id, category, title, max_score, due_date, late_policy, created_at'
const SUBMISSION_COLS = 'id, assignment_id, student_id, raw_score, submitted_on, exempt, note'

function toSettings(row: Settings): Settings {
  return {
    ...row,
    categories: row.categories ?? [],
    late_policy: normalizePolicy(row.late_policy),
    portal_enabled: row.portal_enabled ?? true,
  }
}
function toAssignment(row: Assignment & { owner_id?: unknown; subjects?: unknown }): Assignment {
  const { owner_id: _o, subjects: _s, ...rest } = row
  return { ...rest, max_score: Number(rest.max_score), group_id: rest.group_id ?? null }
}

/** ตาราง/คอลัมน์ยังไม่มี = ยังไม่ได้รัน migration กลุ่มคะแนน */
function isMissingSchema(e: unknown) {
  const code = (e as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204'
}
function toSubmission(row: Submission & { assignments?: unknown }): Submission {
  const { assignments: _omit, ...rest } = row
  return { ...rest, raw_score: Number(rest.raw_score) }
}

export function createSupabaseApi(sb: SupabaseClient = getSupabase()): Api {
  async function userId(): Promise<string> {
    const { data } = await sb.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new Error('กรุณาเข้าสู่ระบบใหม่')
    return id
  }

  return {
    mode: 'supabase',

    async getSettings() {
      const found = ok(await sb.from('settings').select(SETTINGS_COLS).maybeSingle<Settings>())
      if (found) return toSettings(found)
      const ins = await sb.from('settings').insert({ teacher_name: '' }).select(SETTINGS_COLS).single<Settings>()
      if (ins.error) {
        // มีอีกแท็บสร้างไปแล้ว
        const again = ok(await sb.from('settings').select(SETTINGS_COLS).single<Settings>())
        return toSettings(again)
      }
      return toSettings(ins.data)
    },

    async updateSettings(patch) {
      ok(await sb.from('settings').update(patch).eq('owner_id', await userId()))
    },

    async listTerms() {
      return ok(
        await sb
          .from('terms')
          .select('id, academic_year, semester, created_at')
          .order('academic_year', { ascending: false })
          .order('semester', { ascending: false }),
      ) as Term[]
    },
    async createTerm(input) {
      return ok(await sb.from('terms').insert(input).select('id, academic_year, semester, created_at').single<Term>())
    },
    async deleteTerm(id) {
      ok(await sb.from('terms').delete().eq('id', id))
    },

    async listClassrooms(termId) {
      return ok(await sb.from('classrooms').select('id, term_id, grade, room').eq('term_id', termId)) as Classroom[]
    },
    async createClassrooms(rows) {
      if (rows.length === 0) return []
      return ok(await sb.from('classrooms').insert(rows).select('id, term_id, grade, room')) as Classroom[]
    },
    async updateClassroom(id, patch) {
      ok(await sb.from('classrooms').update(patch).eq('id', id))
    },
    async deleteClassroom(id) {
      ok(await sb.from('classrooms').delete().eq('id', id))
    },

    async listStudents(termId) {
      return fetchAll<Student>((from, to) =>
        sb.from('students').select(STUDENT_COLS).eq('term_id', termId).order('id').range(from, to),
      )
    },
    async insertStudents(rows) {
      const out: Student[] = []
      for (const part of chunk(rows, 500)) {
        out.push(...(ok(await sb.from('students').insert(part).select(STUDENT_COLS)) as Student[]))
      }
      return out
    },
    async updateStudents(rows) {
      for (const part of chunk(rows, 500)) {
        ok(await sb.from('students').upsert(part, { onConflict: 'id' }))
      }
    },
    async deleteStudents(ids) {
      for (const part of chunk(ids, ID_CHUNK)) {
        ok(await sb.from('students').delete().in('id', part))
      }
    },
    async regenerateAccessCodes(ids) {
      for (const part of chunk(ids, 500)) {
        ok(await sb.rpc('regenerate_access_codes', { p_student_ids: part }))
      }
    },

    async listSubjects(termId) {
      type Row = Omit<Subject, 'classroom_ids'> & { subject_classrooms: { classroom_id: UUID }[] }
      const rows = ok(
        await sb
          .from('subjects')
          .select('id, term_id, code, name, color, full_score, subject_classrooms(classroom_id)')
          .eq('term_id', termId)
          .order('code')
          .order('name'),
      ) as Row[]
      return rows.map(({ subject_classrooms, ...s }) => ({
        ...s,
        full_score: s.full_score == null ? null : Number(s.full_score),
        classroom_ids: subject_classrooms.map((x) => x.classroom_id),
      }))
    },
    async createSubject({ classroom_ids, ...input }) {
      const row = ok(
        await sb.from('subjects').insert(input).select('id, term_id, code, name, color, full_score').single(),
      ) as Omit<Subject, 'classroom_ids'>
      if (classroom_ids.length) {
        ok(
          await sb
            .from('subject_classrooms')
            .insert(classroom_ids.map((classroom_id) => ({ subject_id: row.id, classroom_id, term_id: row.term_id }))),
        )
      }
      return { ...row, classroom_ids }
    },
    async updateSubject(id, { classroom_ids, ...patch }) {
      if (Object.keys(patch).length) ok(await sb.from('subjects').update(patch).eq('id', id))
      if (classroom_ids) {
        const subject = ok(await sb.from('subjects').select('term_id').eq('id', id).single()) as { term_id: UUID }
        const current = (
          ok(await sb.from('subject_classrooms').select('classroom_id').eq('subject_id', id)) as { classroom_id: UUID }[]
        ).map((r) => r.classroom_id)
        const remove = current.filter((c) => !classroom_ids.includes(c))
        const add = classroom_ids.filter((c) => !current.includes(c))
        if (remove.length) ok(await sb.from('subject_classrooms').delete().eq('subject_id', id).in('classroom_id', remove))
        if (add.length)
          ok(
            await sb
              .from('subject_classrooms')
              .insert(add.map((classroom_id) => ({ subject_id: id, classroom_id, term_id: subject.term_id }))),
          )
      }
    },
    async deleteSubject(id) {
      ok(await sb.from('subjects').delete().eq('id', id))
    },

    async listAssignments(subjectId) {
      const rows = ok(
        await sb
          .from('assignments')
          .select('*')
          .eq('subject_id', subjectId)
          .order('due_date')
          .order('created_at'),
      ) as Assignment[]
      return rows.map(toAssignment)
    },
    async createAssignment(input) {
      return toAssignment(ok(await sb.from('assignments').insert(input).select(ASSIGNMENT_COLS).single<Assignment>()))
    },
    async updateAssignment(id, patch) {
      ok(await sb.from('assignments').update(patch).eq('id', id))
    },
    async deleteAssignment(id) {
      ok(await sb.from('assignments').delete().eq('id', id))
    },
    async listTermAssignments(termId) {
      const rows = await fetchAll<Assignment>((from, to) =>
        sb.from('assignments').select('*, subjects!inner(term_id)').eq('subjects.term_id', termId).order('id').range(from, to),
      )
      return rows.map(toAssignment)
    },

    async listGroups(subjectId) {
      const res = await sb.from('score_groups').select('id, subject_id, name, max_score, created_at').eq('subject_id', subjectId).order('created_at')
      if (res.error && isMissingSchema(res.error)) return []
      return (ok(res) as ScoreGroup[]).map((g) => ({ ...g, max_score: Number(g.max_score) }))
    },
    async saveGroup({ assignment_ids, ...input }, id) {
      let groupId = id
      if (groupId) {
        ok(await sb.from('score_groups').update({ name: input.name, max_score: input.max_score }).eq('id', groupId))
      } else {
        const res = await sb.from('score_groups').insert(input).select('id').single<{ id: string }>()
        if (res.error && isMissingSchema(res.error))
          throw new Error('ยังไม่ได้เปิดใช้กลุ่มคะแนน: รันไฟล์ supabase/migrations/20261105000000_score_groups.sql ใน Supabase SQL Editor ก่อน')
        groupId = ok(res).id
      }
      ok(await sb.from('assignments').update({ group_id: null }).eq('group_id', groupId))
      for (const part of chunk(assignment_ids, ID_CHUNK)) {
        ok(await sb.from('assignments').update({ group_id: groupId }).in('id', part))
      }
    },
    async deleteGroup(id) {
      ok(await sb.from('score_groups').delete().eq('id', id))
    },

    async listDueDates(subjectId) {
      const rows = ok(
        await sb
          .from('assignment_due_dates')
          .select('assignment_id, classroom_id, due_date, assignments!inner(subject_id)')
          .eq('assignments.subject_id', subjectId),
      ) as (DueDate & { assignments: unknown })[]
      return rows.map(({ assignment_id, classroom_id, due_date }) => ({ assignment_id, classroom_id, due_date }))
    },
    async setDueDate(assignmentId, classroomId, dueDate) {
      if (dueDate == null) {
        ok(
          await sb
            .from('assignment_due_dates')
            .delete()
            .eq('assignment_id', assignmentId)
            .eq('classroom_id', classroomId),
        )
      } else {
        ok(
          await sb
            .from('assignment_due_dates')
            .upsert(
              { assignment_id: assignmentId, classroom_id: classroomId, due_date: dueDate },
              { onConflict: 'assignment_id,classroom_id' },
            ),
        )
      }
    },

    async listSubmissions(subjectId, studentIds) {
      const parts = await Promise.all(
        chunk(studentIds, ID_CHUNK).map((ids) =>
          fetchAll<Submission>((from, to) =>
            sb
              .from('submissions')
              .select(`${SUBMISSION_COLS}, assignments!inner(subject_id)`)
              .eq('assignments.subject_id', subjectId)
              .in('student_id', ids)
              .order('id')
              .range(from, to),
          ),
        ),
      )
      return parts.flat().map(toSubmission)
    },
    async saveSubmissions(rows) {
      const out: Submission[] = []
      for (const part of chunk(rows, 500)) {
        const saved = ok(
          await sb.from('submissions').upsert(part, { onConflict: 'assignment_id,student_id' }).select(SUBMISSION_COLS),
        ) as Submission[]
        out.push(...saved.map(toSubmission))
      }
      return out
    },
    async deleteSubmissions(assignmentId, studentIds) {
      for (const part of chunk(studentIds, ID_CHUNK)) {
        ok(await sb.from('submissions').delete().eq('assignment_id', assignmentId).in('student_id', part))
      }
    },

    async getStudentReport(accessCode) {
      const data = ok(await sb.rpc('student_report', { p_code: accessCode })) as
        | (StudentReport & { disabled?: undefined })
        | { disabled: true }
        | null
      if (!data) return { status: 'not_found' }
      if (data.disabled) return { status: 'disabled' }
      return { status: 'ok', report: normalizeReport(data as StudentReport) }
    },
  }
}
