import { DEFAULT_LATE_POLICY, normalizePolicy } from '../scoring'
import type {
  Api,
  Assignment,
  Classroom,
  DueDate,
  ScoreGroup,
  Settings,
  Student,
  StudentReport,
  Subject,
  Submission,
  Term,
} from './types'
import { seedDemo } from './demo-seed'
import { genAccessCode, normalizeAccessCode } from '../access'
import { normalizeReport } from '../report'

/** ฐานข้อมูลจำลองในเบราว์เซอร์ (โหมดสาธิต) */
export interface LocalDB {
  settings: Settings
  terms: Term[]
  classrooms: Classroom[]
  students: Student[]
  subjects: Omit<Subject, 'classroom_ids'>[]
  subject_classrooms: { subject_id: string; classroom_id: string }[]
  assignments: Assignment[]
  due_dates: DueDate[]
  submissions: Submission[]
  groups: ScoreGroup[]
}

const KEY = 'kengscore:demo-db:v1'

export function emptyDB(): LocalDB {
  return {
    settings: {
      active_term_id: null,
      teacher_name: '',
      school_name: '',
      categories: ['สมุด', 'ใบงาน', 'สอบเก็บคะแนน', 'ชิ้นงาน'],
      late_policy: { ...DEFAULT_LATE_POLICY },
      portal_enabled: true,
    },
    terms: [],
    classrooms: [],
    students: [],
    subjects: [],
    subject_classrooms: [],
    assignments: [],
    due_dates: [],
    submissions: [],
    groups: [],
  }
}

function load(): LocalDB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = { ...emptyDB(), ...(JSON.parse(raw) as LocalDB) }
      // ข้อมูลสาธิตรุ่นก่อนยังไม่มีรหัสดูคะแนน
      db.settings = { ...emptyDB().settings, ...db.settings }
      for (const s of db.students) if (!s.access_code) s.access_code = genAccessCode()
      return db
    }
  } catch {
    /* ignore */
  }
  const db = seedDemo(emptyDB())
  persist(db)
  return db
}

function persist(db: LocalDB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage เต็มหรือถูกปิด: ใช้ต่อในหน่วยความจำ */
  }
}

export function resetDemoData() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

const clone = <T,>(v: T): T => structuredClone(v)
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

function duplicate(): never {
  throw new Error('duplicate key value violates unique constraint')
}

export function createLocalApi(): Api {
  const db = load()
  const save = () => persist(db)

  function cascadeDeleteStudents(ids: Set<string>) {
    db.students = db.students.filter((s) => !ids.has(s.id))
    db.submissions = db.submissions.filter((s) => !ids.has(s.student_id))
  }
  function cascadeDeleteAssignments(ids: Set<string>) {
    db.assignments = db.assignments.filter((a) => !ids.has(a.id))
    db.due_dates = db.due_dates.filter((d) => !ids.has(d.assignment_id))
    db.submissions = db.submissions.filter((s) => !ids.has(s.assignment_id))
  }
  function cascadeDeleteSubjects(ids: Set<string>) {
    db.subjects = db.subjects.filter((s) => !ids.has(s.id))
    db.groups = db.groups.filter((g) => !ids.has(g.subject_id))
    db.subject_classrooms = db.subject_classrooms.filter((x) => !ids.has(x.subject_id))
    cascadeDeleteAssignments(new Set(db.assignments.filter((a) => ids.has(a.subject_id)).map((a) => a.id)))
  }
  function cascadeDeleteClassrooms(ids: Set<string>) {
    db.classrooms = db.classrooms.filter((c) => !ids.has(c.id))
    db.subject_classrooms = db.subject_classrooms.filter((x) => !ids.has(x.classroom_id))
    db.due_dates = db.due_dates.filter((d) => !ids.has(d.classroom_id))
    cascadeDeleteStudents(new Set(db.students.filter((s) => ids.has(s.classroom_id)).map((s) => s.id)))
  }
  function checkStudentCode(s: Pick<Student, 'id' | 'term_id' | 'student_code'>) {
    if (!s.student_code) return
    if (db.students.some((o) => o.id !== s.id && o.term_id === s.term_id && o.student_code === s.student_code)) duplicate()
  }

  return {
    mode: 'local',

    async getSettings() {
      await tick()
      return clone({ ...db.settings, late_policy: normalizePolicy(db.settings.late_policy) })
    },
    async updateSettings(patch) {
      db.settings = { ...db.settings, ...clone(patch) }
      save()
    },

    async listTerms() {
      await tick()
      return clone(db.terms)
    },
    async createTerm(input) {
      if (db.terms.some((t) => t.academic_year === input.academic_year && t.semester === input.semester)) duplicate()
      const term: Term = { id: uid(), ...input, created_at: new Date().toISOString() }
      db.terms.push(term)
      save()
      return clone(term)
    },
    async deleteTerm(id) {
      db.terms = db.terms.filter((t) => t.id !== id)
      cascadeDeleteSubjects(new Set(db.subjects.filter((s) => s.term_id === id).map((s) => s.id)))
      cascadeDeleteClassrooms(new Set(db.classrooms.filter((c) => c.term_id === id).map((c) => c.id)))
      if (db.settings.active_term_id === id) db.settings.active_term_id = null
      save()
    },

    async listClassrooms(termId) {
      await tick()
      return clone(db.classrooms.filter((c) => c.term_id === termId))
    },
    async createClassrooms(rows) {
      const created = rows.map((r) => {
        if (db.classrooms.some((c) => c.term_id === r.term_id && c.grade === r.grade && c.room === r.room)) duplicate()
        return { id: uid(), ...r }
      })
      db.classrooms.push(...created)
      save()
      return clone(created)
    },
    async updateClassroom(id, patch) {
      const c = db.classrooms.find((x) => x.id === id)
      if (!c) return
      const next = { ...c, ...patch }
      if (db.classrooms.some((o) => o.id !== id && o.term_id === c.term_id && o.grade === next.grade && o.room === next.room))
        duplicate()
      Object.assign(c, patch)
      save()
    },
    async deleteClassroom(id) {
      cascadeDeleteClassrooms(new Set([id]))
      save()
    },

    async listStudents(termId) {
      await tick()
      return clone(db.students.filter((s) => s.term_id === termId))
    },
    async insertStudents(rows) {
      const created: Student[] = []
      for (const r of rows) {
        const s: Student = { id: uid(), access_code: genAccessCode(), ...r }
        checkStudentCode(s)
        db.students.push(s)
        created.push(s)
      }
      save()
      return clone(created)
    },
    async updateStudents(rows) {
      for (const r of rows) {
        checkStudentCode(r)
        const i = db.students.findIndex((s) => s.id === r.id)
        if (i >= 0) db.students[i] = { ...clone(r), access_code: r.access_code ?? db.students[i].access_code }
      }
      save()
    },
    async deleteStudents(ids) {
      cascadeDeleteStudents(new Set(ids))
      save()
    },
    async regenerateAccessCodes(ids) {
      const set = new Set(ids)
      for (const s of db.students) if (set.has(s.id)) s.access_code = genAccessCode()
      save()
    },

    async listSubjects(termId) {
      await tick()
      return clone(
        db.subjects
          .filter((s) => s.term_id === termId)
          .map((s) => ({
            ...s,
            classroom_ids: db.subject_classrooms.filter((x) => x.subject_id === s.id).map((x) => x.classroom_id),
          })),
      )
    },
    async createSubject({ classroom_ids, ...input }) {
      const s = { id: uid(), ...input }
      db.subjects.push(s)
      db.subject_classrooms.push(...classroom_ids.map((classroom_id) => ({ subject_id: s.id, classroom_id })))
      save()
      return clone({ ...s, classroom_ids })
    },
    async updateSubject(id, { classroom_ids, ...patch }) {
      const s = db.subjects.find((x) => x.id === id)
      if (!s) return
      Object.assign(s, patch)
      if (classroom_ids) {
        db.subject_classrooms = db.subject_classrooms
          .filter((x) => x.subject_id !== id)
          .concat(classroom_ids.map((classroom_id) => ({ subject_id: id, classroom_id })))
      }
      save()
    },
    async deleteSubject(id) {
      cascadeDeleteSubjects(new Set([id]))
      save()
    },

    async listAssignments(subjectId) {
      await tick()
      return clone(
        db.assignments
          .filter((a) => a.subject_id === subjectId)
          .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at)),
      )
    },
    async createAssignment(input) {
      const a: Assignment = { id: uid(), ...clone(input), created_at: new Date().toISOString() }
      db.assignments.push(a)
      save()
      return clone(a)
    },
    async updateAssignment(id, patch) {
      const a = db.assignments.find((x) => x.id === id)
      if (a) Object.assign(a, clone(patch))
      save()
    },
    async deleteAssignment(id) {
      cascadeDeleteAssignments(new Set([id]))
      save()
    },
    async listTermAssignments(termId) {
      await tick()
      const subs = new Set(db.subjects.filter((s) => s.term_id === termId).map((s) => s.id))
      return clone(db.assignments.filter((a) => subs.has(a.subject_id)))
    },

    async listGroups(subjectId) {
      await tick()
      return clone(db.groups.filter((g) => g.subject_id === subjectId).sort((a, b) => a.created_at.localeCompare(b.created_at)))
    },
    async saveGroup({ assignment_ids, ...input }, id) {
      let g = id ? db.groups.find((x) => x.id === id) : undefined
      if (g) Object.assign(g, { name: input.name, max_score: input.max_score })
      else {
        g = { id: uid(), ...input, created_at: new Date().toISOString() }
        db.groups.push(g)
      }
      const members = new Set(assignment_ids)
      for (const a of db.assignments) {
        if (a.group_id === g.id && !members.has(a.id)) a.group_id = null
        if (members.has(a.id)) a.group_id = g.id
      }
      save()
    },
    async deleteGroup(id) {
      db.groups = db.groups.filter((g) => g.id !== id)
      for (const a of db.assignments) if (a.group_id === id) a.group_id = null
      save()
    },

    async listDueDates(subjectId) {
      await tick()
      const ids = new Set(db.assignments.filter((a) => a.subject_id === subjectId).map((a) => a.id))
      return clone(db.due_dates.filter((d) => ids.has(d.assignment_id)))
    },
    async setDueDate(assignmentId, classroomId, dueDate) {
      db.due_dates = db.due_dates.filter((d) => !(d.assignment_id === assignmentId && d.classroom_id === classroomId))
      if (dueDate) db.due_dates.push({ assignment_id: assignmentId, classroom_id: classroomId, due_date: dueDate })
      save()
    },

    async listSubmissions(subjectId, studentIds) {
      await tick()
      const ids = new Set(db.assignments.filter((a) => a.subject_id === subjectId).map((a) => a.id))
      const stu = new Set(studentIds)
      return clone(db.submissions.filter((s) => ids.has(s.assignment_id) && stu.has(s.student_id)))
    },
    async saveSubmissions(rows) {
      const out: Submission[] = []
      for (const r of rows) {
        const existing = db.submissions.find((s) => s.assignment_id === r.assignment_id && s.student_id === r.student_id)
        if (existing) {
          Object.assign(existing, r)
          out.push(existing)
        } else {
          const s = { id: uid(), ...r }
          db.submissions.push(s)
          out.push(s)
        }
      }
      save()
      return clone(out)
    },
    async deleteSubmissions(assignmentId, studentIds) {
      const ids = new Set(studentIds)
      db.submissions = db.submissions.filter((s) => !(s.assignment_id === assignmentId && ids.has(s.student_id)))
      save()
    },

    async getStudentReport(accessCode) {
      await tick()
      const code = normalizeAccessCode(accessCode)
      const s = code.length === 8 ? db.students.find((x) => x.access_code === code) : undefined
      if (!s) return { status: 'not_found' }
      if (!db.settings.portal_enabled) return { status: 'disabled' }
      const room = db.classrooms.find((c) => c.id === s.classroom_id)
      const term = db.terms.find((t) => t.id === s.term_id)
      if (!room || !term) return { status: 'not_found' }
      const subjectIds = new Set(db.subject_classrooms.filter((x) => x.classroom_id === room.id).map((x) => x.subject_id))
      const report: StudentReport = {
        student: {
          prefix: s.prefix,
          first_name: s.first_name,
          last_name: s.last_name,
          number: s.number,
          student_code: s.student_code,
          grade: room.grade,
          room: room.room,
        },
        term: { academic_year: term.academic_year, semester: term.semester },
        teacher_name: db.settings.teacher_name,
        school_name: db.settings.school_name,
        late_policy: db.settings.late_policy,
        categories: db.settings.categories,
        subjects: db.subjects
          .filter((sub) => subjectIds.has(sub.id))
          .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name))
          .map((sub) => ({
            id: sub.id,
            code: sub.code,
            name: sub.name,
            color: sub.color,
            full_score: sub.full_score,
            assignments: db.assignments
              .filter((a) => a.subject_id === sub.id)
              .map((a) => {
                const due = db.due_dates.find((d) => d.assignment_id === a.id && d.classroom_id === room.id)?.due_date ?? a.due_date
                const sm = db.submissions.find((x) => x.assignment_id === a.id && x.student_id === s.id)
                return {
                  id: a.id,
                  category: a.category,
                  title: a.title,
                  max_score: a.max_score,
                  due_date: due,
                  late_policy: a.late_policy,
                  created_at: a.created_at,
                  submission: sm ? { raw_score: sm.raw_score, submitted_on: sm.submitted_on, exempt: sm.exempt } : null,
                }
              })
              .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at)),
          })),
      }
      return { status: 'ok', report: normalizeReport(clone(report)) }
    },
  }
}
