export type UUID = string
/** วันที่รูปแบบ YYYY-MM-DD (ตามเวลาท้องถิ่น) */
export type ISODate = string

export type LateMode = 'none' | 'percent' | 'points'
export type LatePer = 'day' | 'week'
export type LateRound = 'none' | 'half' | 'int'

/** นโยบายหักคะแนนส่งช้า */
export interface LatePolicy {
  /** none = ไม่หัก, percent = หักเป็น % ของคะแนนที่ได้, points = หักเป็นคะแนน */
  mode: LateMode
  /** จำนวนที่หักต่อ 1 หน่วยเวลา (% หรือ คะแนน) */
  amount: number
  /** หน่วยเวลา: ต่อวัน หรือ ต่อสัปดาห์ */
  per: LatePer
  /** ผ่อนผันกี่หน่วยก่อนเริ่มหัก */
  grace: number
  /** คะแนนต่ำสุดที่ยังได้ (% ของคะแนนที่ทำได้) */
  floor: number
  /** นับเฉพาะวันจันทร์–ศุกร์ */
  weekdaysOnly: boolean
  /** การปัดเศษคะแนนสุทธิ */
  round: LateRound
}

export interface Term {
  id: UUID
  academic_year: number
  semester: number
  created_at: string
}

export interface Settings {
  active_term_id: UUID | null
  teacher_name: string
  school_name: string
  categories: string[]
  late_policy: LatePolicy
  /** เปิดให้นักเรียนดูคะแนนของตัวเอง */
  portal_enabled: boolean
}

export interface Classroom {
  id: UUID
  term_id: UUID
  grade: string
  room: string
}

export interface Student {
  id: UUID
  term_id: UUID
  classroom_id: UUID
  number: number | null
  student_code: string
  prefix: string
  first_name: string
  last_name: string
  /** รหัสดูคะแนนของนักเรียน (8 ตัว ระบบสุ่มให้) */
  access_code: string
}
export type StudentInput = Omit<Student, 'id' | 'access_code'>
export type StudentUpdate = StudentInput & { id: UUID; access_code?: string }

export interface Subject {
  id: UUID
  term_id: UUID
  code: string
  name: string
  color: string
  full_score: number | null
  classroom_ids: UUID[]
}
export type SubjectInput = Omit<Subject, 'id'>

export interface Assignment {
  id: UUID
  subject_id: UUID
  category: string
  title: string
  max_score: number
  due_date: ISODate
  late_policy: LatePolicy | null
  created_at: string
}
export type AssignmentInput = Omit<Assignment, 'id' | 'created_at'>

/** กำหนดส่งเฉพาะห้อง (override จาก assignment.due_date) */
export interface DueDate {
  assignment_id: UUID
  classroom_id: UUID
  due_date: ISODate
}

export interface Submission {
  id: UUID
  assignment_id: UUID
  student_id: UUID
  raw_score: number
  submitted_on: ISODate
  exempt: boolean
  note: string
}
export type SubmissionInput = Omit<Submission, 'id'>

/** ข้อมูลที่นักเรียนเห็นในหน้าคะแนนของตัวเอง */
export interface StudentReport {
  student: {
    prefix: string
    first_name: string
    last_name: string
    number: number | null
    student_code: string
    grade: string
    room: string
  }
  term: { academic_year: number; semester: number }
  teacher_name: string
  school_name: string
  late_policy: LatePolicy
  categories: string[]
  subjects: ReportSubject[]
}

export interface ReportSubject {
  id: UUID
  code: string
  name: string
  color: string
  full_score: number | null
  assignments: ReportAssignment[]
}

export interface ReportAssignment {
  id: UUID
  category: string
  title: string
  max_score: number
  /** กำหนดส่งของห้องนักเรียน (รวม override แล้ว) */
  due_date: ISODate
  late_policy: LatePolicy | null
  created_at: string
  submission: { raw_score: number; submitted_on: ISODate; exempt: boolean } | null
}

export type StudentReportResult =
  | { status: 'ok'; report: StudentReport }
  | { status: 'not_found' }
  | { status: 'disabled' }

export interface Api {
  readonly mode: 'supabase' | 'local'

  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<void>

  listTerms(): Promise<Term[]>
  createTerm(input: { academic_year: number; semester: number }): Promise<Term>
  deleteTerm(id: UUID): Promise<void>

  listClassrooms(termId: UUID): Promise<Classroom[]>
  createClassrooms(rows: Omit<Classroom, 'id'>[]): Promise<Classroom[]>
  updateClassroom(id: UUID, patch: Partial<Pick<Classroom, 'grade' | 'room'>>): Promise<void>
  deleteClassroom(id: UUID): Promise<void>

  listStudents(termId: UUID): Promise<Student[]>
  insertStudents(rows: StudentInput[]): Promise<Student[]>
  updateStudents(rows: StudentUpdate[]): Promise<void>
  deleteStudents(ids: UUID[]): Promise<void>
  /** สุ่มรหัสดูคะแนนใหม่ (รหัสเดิมใช้ไม่ได้อีก) */
  regenerateAccessCodes(ids: UUID[]): Promise<void>

  listSubjects(termId: UUID): Promise<Subject[]>
  createSubject(input: SubjectInput): Promise<Subject>
  updateSubject(id: UUID, patch: Partial<SubjectInput>): Promise<void>
  deleteSubject(id: UUID): Promise<void>

  listAssignments(subjectId: UUID): Promise<Assignment[]>
  createAssignment(input: AssignmentInput): Promise<Assignment>
  updateAssignment(id: UUID, patch: Partial<AssignmentInput>): Promise<void>
  deleteAssignment(id: UUID): Promise<void>

  listDueDates(subjectId: UUID): Promise<DueDate[]>
  /** due_date = null → ลบ override (กลับไปใช้กำหนดส่งหลัก) */
  setDueDate(assignmentId: UUID, classroomId: UUID, dueDate: ISODate | null): Promise<void>

  /** คะแนนทุกงานของรายวิชา เฉพาะนักเรียนที่ระบุ (เช่น นักเรียนในห้อง) */
  listSubmissions(subjectId: UUID, studentIds: UUID[]): Promise<Submission[]>
  /** upsert ตาม (assignment_id, student_id) */
  saveSubmissions(rows: SubmissionInput[]): Promise<Submission[]>
  deleteSubmissions(assignmentId: UUID, studentIds: UUID[]): Promise<void>

  /** หน้าคะแนนของนักเรียน: ใช้ได้โดยไม่ต้องเข้าสู่ระบบ */
  getStudentReport(accessCode: string): Promise<StudentReportResult>
}
