import { describe, expect, it } from 'vitest'
import type { Assignment, ScoreGroup, Student, Submission } from './api/types'
import { buildGradebook, groupScore, mainColumns } from './gradebook'
import { DEFAULT_LATE_POLICY } from './scoring'

const a = (id: string, max: number, group_id: string | null = null): Assignment => ({
  id,
  subject_id: 's',
  category: 'สมุด',
  title: id,
  max_score: max,
  due_date: '2026-11-02',
  late_policy: null,
  created_at: id,
  group_id,
})
const g: ScoreGroup = { id: 'g1', subject_id: 's', name: 'สมุดก่อนกลางภาค', max_score: 20, created_at: '' }
const st: Student = { id: 'p', term_id: 't', classroom_id: 'c', number: 1, student_code: '', prefix: '', first_name: 'ก', last_name: '', access_code: '' }
const sub = (assignment_id: string, raw_score: number): Submission => ({
  id: assignment_id + 'x',
  assignment_id,
  student_id: 'p',
  raw_score,
  submitted_on: '2026-11-02',
  exempt: false,
  note: '',
})

describe('กลุ่มคะแนน', () => {
  it('คิดสัดส่วนจากผลรวม แล้วแปลงเป็นคะแนนเต็มของกลุ่ม', () => {
    expect(groupScore([{ final: 5, max: 5 }, { final: 0, max: 5 }], 20)).toBe(10)
    expect(groupScore([{ final: 4, max: 5 }, { final: 3, max: 5 }, { final: 5, max: 5 }], 20)).toBe(16)
  })
  it('กลุ่มอยู่ตำแหน่งงานแรกของกลุ่ม งานอื่นเป็นคอลัมน์เดี่ยว', () => {
    const cols = mainColumns([a('n1', 5, 'g1'), a('w1', 10), a('n2', 5, 'g1')], [g])
    expect(cols.map((c) => (c.kind === 'group' ? c.group.id : c.assignment.id))).toEqual(['g1', 'w1'])
  })
  it('รวมคะแนนหลัก = คะแนนกลุ่ม + งานเดี่ยว', () => {
    const list = [a('n1', 5, 'g1'), a('n2', 5, 'g1'), a('w1', 10)]
    const book = buildGradebook([st], list, [sub('n1', 5), sub('w1', 8)], [], 'c', DEFAULT_LATE_POLICY, [g])
    expect(book.maxTotal).toBe(30)
    expect(book.rows[0].main.map((m) => m.score)).toEqual([10, 8])
    expect(book.rows[0].total).toBe(18)
    expect(book.rows[0].missing).toBe(1)
  })
  it('ไม่มีกลุ่ม = รวมแบบเดิม', () => {
    const list = [a('n1', 5), a('w1', 10)]
    const book = buildGradebook([st], list, [sub('n1', 4), sub('w1', 8)], [], 'c', DEFAULT_LATE_POLICY)
    expect(book.maxTotal).toBe(15)
    expect(book.rows[0].total).toBe(12)
  })
})
