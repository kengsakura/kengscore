import { describe, expect, it } from 'vitest'
import type { Assignment, Student, Subject } from './api/types'
import { buildFollowUp } from './followup'
import { DEFAULT_LATE_POLICY } from './scoring'

const subj = (id: string): Subject => ({ id, term_id: 't', code: id, name: id, color: 'indigo', full_score: null, classroom_ids: ['c'] })
const a = (id: string, subject_id: string, due_date: string): Assignment => ({
  id, subject_id, category: 'ใบงาน', title: id, max_score: 10, due_date, late_policy: null, created_at: id,
})
const st: Student = { id: 'p', term_id: 't', classroom_id: 'c', number: 1, student_code: '', prefix: '', first_name: 'ก', last_name: '', access_code: '' }

describe('buildFollowUp', () => {
  const data = [
    { subject: subj('A'), assignments: [a('a1', 'A', '2026-11-01'), a('a2', 'A', '2026-11-10')], dueDates: [], submissions: [] },
    {
      subject: subj('B'),
      assignments: [a('b1', 'B', '2026-11-02')],
      dueDates: [],
      submissions: [{ id: 's', assignment_id: 'b1', student_id: 'p', raw_score: 10, submitted_on: '2026-11-04', exempt: false, note: '' }],
    },
  ]
  it('นับเฉพาะงานที่เลยกำหนดและยังไม่ส่ง ข้ามทุกวิชา', () => {
    const [r] = buildFollowUp([st], data, 'c', DEFAULT_LATE_POLICY, '2026-11-05', false)
    expect(r.missing.map((m) => m.assignment.id)).toEqual(['a1'])
    expect(r.perSubject).toEqual([1, 0])
    expect(r.late).toBe(1)
  })
  it('รวมงานที่ยังไม่ถึงกำหนดเมื่อเลือก', () => {
    const [r] = buildFollowUp([st], data, 'c', DEFAULT_LATE_POLICY, '2026-11-05', true)
    expect(r.missing.map((m) => [m.assignment.id, m.overdue])).toEqual([['a1', true], ['a2', false]])
  })
})
