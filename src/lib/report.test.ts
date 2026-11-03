import { describe, expect, it } from 'vitest'
import type { ReportAssignment, StudentReport } from './api/types'
import { DEFAULT_LATE_POLICY } from './scoring'
import { normalizeReport, summarizeReport } from './report'
import { formatAccessCode, isValidAccessCode, normalizeAccessCode } from './access'

const A = (o: Partial<ReportAssignment>): ReportAssignment => ({
  id: Math.random().toString(),
  category: 'ใบงาน',
  title: 'งาน',
  max_score: 10,
  due_date: '2026-11-02',
  late_policy: null,
  created_at: '2026-11-01T00:00:00Z',
  submission: null,
  ...o,
})

const report = (assignments: ReportAssignment[]): StudentReport => ({
  student: { prefix: 'ด.ช.', first_name: 'ก', last_name: 'ข', number: 1, student_code: '1', grade: 'ม.1', room: '1' },
  term: { academic_year: 2569, semester: 2 },
  teacher_name: '',
  school_name: '',
  late_policy: { ...DEFAULT_LATE_POLICY, weekdaysOnly: false },
  categories: [],
  subjects: [{ id: 's', code: 'ว1', name: 'วิทย์', color: 'indigo', full_score: 70, assignments }],
})

describe('summarizeReport', () => {
  const today = '2026-11-05'
  const r = report([
    A({ title: 'ตรงเวลา', submission: { raw_score: 9, submitted_on: '2026-11-02', exempt: false } }),
    A({ title: 'ช้า', submission: { raw_score: 10, submitted_on: '2026-11-04', exempt: false } }),
    A({ title: 'ค้าง', due_date: '2026-11-03' }),
    A({ title: 'วันนี้', due_date: today }),
    A({ title: 'อนาคต', due_date: '2026-11-20' }),
  ])
  const s = summarizeReport(r, today)

  it('จัดสถานะงาน', () => {
    expect(s.subjects[0].items.map((i) => i.status)).toEqual(['done', 'late', 'overdue', 'today', 'upcoming'])
  })
  it('รวมคะแนนสุทธิแบบเดียวกับหน้าครู', () => {
    // 9 + (10 หัก 20%) = 17 จากเต็ม 50
    expect(s.subjects[0].total).toBe(17)
    expect(s.subjects[0].maxTotal).toBe(50)
    expect(s.subjects[0].percent).toBe(34)
    expect(s.subjects[0].scaled).toBe(23.8)
  })
  it('รายการงานที่ต้องรีบส่ง + คะแนนสูงสุดถ้าส่งวันนี้', () => {
    expect(s.todo.map((i) => i.assignment.title)).toEqual(['ค้าง', 'วันนี้'])
    expect(s.todo[0].overdueDays).toBe(2)
    expect(s.todo[0].bestIfToday).toBe(8)
    expect(s.upcoming).toHaveLength(1)
    expect(s.submitted).toBe(2)
    expect(s.late).toBe(1)
  })
  it('normalizeReport แปลงตัวเลขจาก JSON', () => {
    const raw = report([A({ max_score: '10.00' as unknown as number, submission: { raw_score: '8.50' as unknown as number, submitted_on: today, exempt: false } })])
    const n = normalizeReport(raw)
    expect(n.subjects[0].assignments[0].max_score).toBe(10)
    expect(n.subjects[0].assignments[0].submission?.raw_score).toBe(8.5)
  })
})

describe('access code', () => {
  it('normalize / format / validate', () => {
    expect(normalizeAccessCode(' k7m2-qx9p ')).toBe('K7M2QX9P')
    expect(formatAccessCode('k7m2qx9p')).toBe('K7M2-QX9P')
    expect(isValidAccessCode('k7m2-qx9p')).toBe(true)
    expect(isValidAccessCode('K7M2QX90')).toBe(false) // 0 ไม่อยู่ในชุดอักษร
    expect(isValidAccessCode('K7M2')).toBe(false)
  })
})

describe('summarizeReport กับกลุ่มคะแนน', () => {
  it('รวมคะแนนแบบเดียวกับหน้าครู', async () => {
    const { summarizeReport } = await import('./report')
    const asg = (id: string, raw: number | null, group_id: string | null) => ({
      id, category: 'สมุด', title: id, max_score: 5, due_date: '2026-11-01', late_policy: null, created_at: id, group_id,
      submission: raw == null ? null : { raw_score: raw, submitted_on: '2026-11-01', exempt: false },
    })
    const sum = summarizeReport(
      {
        student: { prefix: '', first_name: 'ก', last_name: '', number: 1, student_code: '', grade: 'ม.1', room: '1' },
        term: { academic_year: 2569, semester: 2 },
        teacher_name: '', school_name: '', categories: [],
        late_policy: { mode: 'none', amount: 0, per: 'day', grace: 0, floor: 0, weekdaysOnly: true, round: 'none' },
        subjects: [{
          id: 's', code: '', name: 'วิชา', color: 'indigo', full_score: null,
          groups: [{ id: 'g', name: 'สมุด', max_score: 20 }],
          assignments: [asg('n1', 5, 'g'), asg('n2', null, 'g'), asg('w', 4, null)],
        }],
      },
      '2026-11-02',
    )
    expect(sum.subjects[0].total).toBe(14)
    expect(sum.subjects[0].maxTotal).toBe(25)
  })
})
