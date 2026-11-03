import type { ISODate, ReportAssignment, ReportSubject, StudentReport } from './api/types'
import { computeScore, dayNumber, effectivePolicy, normalizePolicy, type ScoreResult } from './scoring'
import { groupScore } from './gradebook'

/** แปลงตัวเลขที่มาจาก JSON ให้เป็น number และเติมค่า default ของนโยบาย */
export function normalizeReport(r: StudentReport): StudentReport {
  return {
    ...r,
    late_policy: normalizePolicy(r.late_policy),
    categories: r.categories ?? [],
    subjects: (r.subjects ?? []).map((s) => ({
      ...s,
      full_score: s.full_score == null ? null : Number(s.full_score),
      groups: (s.groups ?? []).map((g) => ({ ...g, max_score: Number(g.max_score) })),
      assignments: (s.assignments ?? []).map((a) => ({
        ...a,
        max_score: Number(a.max_score),
        submission: a.submission ? { ...a.submission, raw_score: Number(a.submission.raw_score) } : null,
      })),
    })),
  }
}

/**
 * done = ส่งตรงเวลา, late = ส่งช้า, overdue = เลยกำหนดยังไม่ส่ง,
 * today = ครบกำหนดวันนี้ยังไม่ส่ง, upcoming = ยังไม่ถึงกำหนด
 */
export type ItemStatus = 'done' | 'late' | 'overdue' | 'today' | 'upcoming'

export interface ReportItem {
  assignment: ReportAssignment
  subject: ReportSubject
  status: ItemStatus
  result?: ScoreResult
  /** เลยกำหนดมากี่วัน (วันปฏิทิน) */
  overdueDays: number
  /** ถ้าส่งวันนี้และได้เต็ม จะได้สุทธิเท่าไร */
  bestIfToday?: number
}

export interface SubjectSummary {
  subject: ReportSubject
  items: ReportItem[]
  total: number
  maxTotal: number
  percent: number
  scaled: number | null
  submitted: number
  late: number
  pending: number
}

export interface ReportSummary {
  subjects: SubjectSummary[]
  /** งานที่ต้องรีบส่ง: เลยกำหนด + ครบกำหนดวันนี้ เรียงจากค้างนานสุด */
  todo: ReportItem[]
  upcoming: ReportItem[]
  submitted: number
  total: number
  late: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function summarizeReport(report: StudentReport, today: ISODate): ReportSummary {
  const fallback = normalizePolicy(report.late_policy)
  const subjects = report.subjects.map((subject): SubjectSummary => {
    const items = subject.assignments.map((assignment): ReportItem => {
      const policy = effectivePolicy(assignment, fallback)
      const sub = assignment.submission
      if (sub) {
        const result = computeScore(sub.raw_score, assignment.due_date, sub.submitted_on, policy, sub.exempt)
        return { assignment, subject, status: result.lateDays > 0 ? 'late' : 'done', result, overdueDays: 0 }
      }
      const diff = dayNumber(today) - dayNumber(assignment.due_date)
      if (diff > 0) {
        return {
          assignment,
          subject,
          status: 'overdue',
          overdueDays: diff,
          bestIfToday: computeScore(assignment.max_score, assignment.due_date, today, policy).final,
        }
      }
      return { assignment, subject, status: diff === 0 ? 'today' : 'upcoming', overdueDays: 0 }
    })
    // คิดคะแนนรวมแบบเดียวกับหน้าคะแนนรวมของครู: กลุ่มคะแนน + งานเดี่ยว
    const groups = new Map((subject.groups ?? []).map((g) => [g.id, g]))
    const members = new Map<string, { final: number; max: number }[]>()
    let total = 0
    let maxTotal = 0
    for (const i of items) {
      const gid = i.assignment.group_id
      const m = { final: i.result?.final ?? 0, max: i.assignment.max_score }
      if (gid && groups.has(gid)) members.set(gid, [...(members.get(gid) ?? []), m])
      else {
        total += m.final
        maxTotal += m.max
      }
    }
    for (const [gid, list] of members) {
      const g = groups.get(gid)!
      total += groupScore(list, g.max_score)
      maxTotal += g.max_score
    }
    total = round2(total)
    maxTotal = round2(maxTotal)
    return {
      subject,
      items,
      total,
      maxTotal,
      percent: maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0,
      scaled: subject.full_score && maxTotal > 0 ? round2((total / maxTotal) * subject.full_score) : null,
      submitted: items.filter((i) => i.result).length,
      late: items.filter((i) => i.status === 'late').length,
      pending: items.filter((i) => !i.result).length,
    }
  })
  const all = subjects.flatMap((s) => s.items)
  return {
    subjects,
    todo: all
      .filter((i) => i.status === 'overdue' || i.status === 'today')
      .sort((a, b) => b.overdueDays - a.overdueDays),
    upcoming: all.filter((i) => i.status === 'upcoming').sort((a, b) => a.assignment.due_date.localeCompare(b.assignment.due_date)),
    submitted: all.filter((i) => i.result).length,
    total: all.length,
    late: all.filter((i) => i.status === 'late').length,
  }
}
