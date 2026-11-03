import type { Assignment, DueDate, ISODate, LatePolicy, Student, Subject, Submission, UUID } from './api/types'
import { dueDateFor, indexSubmissions, subKey } from './gradebook'
import { scoreSubmission } from './scoring'

export interface MissingItem {
  subject: Subject
  assignment: Assignment
  due: ISODate
  /** เลยกำหนดส่งแล้วหรือยัง */
  overdue: boolean
}

export interface FollowUpRow {
  student: Student
  /** งานที่ยังไม่ส่ง (ตามตัวกรอง) */
  missing: MissingItem[]
  /** จำนวนงานค้างแยกตามวิชา (เรียงตาม subjects) */
  perSubject: number[]
  late: number
}

export interface SubjectData {
  subject: Subject
  assignments: Assignment[]
  dueDates: DueDate[]
  submissions: Submission[]
}

/** สรุปงานค้างของนักเรียนทุกคนในห้อง ข้ามทุกรายวิชา */
export function buildFollowUp(
  students: Student[],
  data: SubjectData[],
  classroomId: UUID,
  fallback: LatePolicy,
  today: ISODate,
  includeNotDue: boolean,
): FollowUpRow[] {
  const prepared = data.map((d) => ({
    ...d,
    subMap: indexSubmissions(d.submissions),
    dues: d.assignments.map((a) => dueDateFor(a, classroomId, d.dueDates)),
  }))
  return students.map((student) => {
    const missing: MissingItem[] = []
    let late = 0
    const perSubject = prepared.map((d) => {
      let n = 0
      d.assignments.forEach((assignment, i) => {
        const due = d.dues[i]
        const sub = d.subMap.get(subKey(assignment.id, student.id))
        if (sub) {
          if (scoreSubmission(sub, assignment, due, fallback).lateDays > 0) late++
          return
        }
        // ครบกำหนดวันนี้ยังส่งได้ทันเวลา → ยังไม่นับว่าค้าง
        const overdue = due < today
        if (!overdue && !includeNotDue) return
        n++
        missing.push({ subject: d.subject, assignment, due, overdue })
      })
      return n
    })
    missing.sort((a, b) => a.due.localeCompare(b.due))
    return { student, missing, perSubject, late }
  })
}
