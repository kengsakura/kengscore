import type { Assignment, ISODate, LatePolicy, Submission } from './api/types'

export const DEFAULT_LATE_POLICY: LatePolicy = {
  mode: 'percent',
  amount: 10,
  per: 'day',
  grace: 0,
  floor: 50,
  weekdaysOnly: true,
  round: 'none',
}

/** รวมค่า default เผื่อข้อมูลเก่าที่ไม่มีบาง field */
export function normalizePolicy(p: Partial<LatePolicy> | null | undefined): LatePolicy {
  return { ...DEFAULT_LATE_POLICY, ...(p ?? {}) }
}

/** แปลง YYYY-MM-DD เป็นเลขวัน (นับจาก epoch) แบบไม่ขึ้นกับ timezone */
export function dayNumber(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** จำนวนวันที่ส่งช้า (0 = ตรงเวลา) */
export function lateDays(due: ISODate, submitted: ISODate, weekdaysOnly: boolean): number {
  const a = dayNumber(due)
  const b = dayNumber(submitted)
  if (b <= a) return 0
  if (!weekdaysOnly) return b - a
  let n = 0
  for (let day = a + 1; day <= b; day++) {
    // 1970-01-01 เป็นวันพฤหัสบดี → (day + 4) % 7: 0 = อาทิตย์, 6 = เสาร์
    const dow = (((day + 4) % 7) + 7) % 7
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

export interface ScoreResult {
  /** คะแนนสุทธิหลังหักส่งช้า */
  final: number
  /** จำนวนวันที่ช้า */
  lateDays: number
  /** จำนวนหน่วย (วัน/สัปดาห์) ที่ถูกหักจริง หลังหักวันผ่อนผัน */
  periods: number
  /** คะแนนที่ถูกหัก */
  deducted: number
}

export function roundScore(x: number, mode: LatePolicy['round']): number {
  if (mode === 'int') return Math.round(x)
  if (mode === 'half') return Math.round(x * 2) / 2
  return Math.round(x * 100) / 100
}

export function computeScore(
  raw: number,
  due: ISODate,
  submitted: ISODate,
  policyIn: LatePolicy,
  exempt = false,
): ScoreResult {
  const policy = normalizePolicy(policyIn)
  const days = lateDays(due, submitted, policy.weekdaysOnly)
  if (days === 0 || exempt || policy.mode === 'none' || policy.amount <= 0) {
    return { final: roundScore(raw, 'none'), lateDays: days, periods: 0, deducted: 0 }
  }
  const unit = policy.per === 'day' ? 1 : policy.weekdaysOnly ? 5 : 7
  const rawPeriods = Math.ceil(days / unit)
  const periods = Math.max(0, rawPeriods - Math.max(0, policy.grace))
  const floorScore = (raw * Math.min(100, Math.max(0, policy.floor))) / 100
  let final: number
  if (policy.mode === 'percent') {
    final = raw * (1 - (policy.amount * periods) / 100)
  } else {
    final = raw - policy.amount * periods
  }
  final = roundScore(Math.max(floorScore, final, 0), policy.round)
  return { final, lateDays: days, periods, deducted: roundScore(raw - final, 'none') }
}

export function effectivePolicy(assignment: Pick<Assignment, 'late_policy'>, fallback: LatePolicy): LatePolicy {
  return normalizePolicy(assignment.late_policy ?? fallback)
}

/** คำนวณคะแนนสุทธิของ submission หนึ่งรายการ */
export function scoreSubmission(
  sub: Submission,
  assignment: Assignment,
  dueDate: ISODate,
  fallback: LatePolicy,
): ScoreResult {
  return computeScore(sub.raw_score, dueDate, sub.submitted_on, effectivePolicy(assignment, fallback), sub.exempt)
}

export function describePolicy(p: LatePolicy): string {
  const policy = normalizePolicy(p)
  if (policy.mode === 'none' || policy.amount <= 0) return 'ไม่หักคะแนนส่งช้า'
  const unit = policy.per === 'day' ? (policy.weekdaysOnly ? 'วันทำการ' : 'วัน') : 'สัปดาห์'
  const amt = policy.mode === 'percent' ? `${fmt(policy.amount)}%` : `${fmt(policy.amount)} คะแนน`
  const parts = [`ส่งช้าหัก ${amt} ต่อ${unit}`]
  if (policy.grace > 0) parts.push(`ผ่อนผัน ${policy.grace} ${unit}แรก`)
  if (policy.floor > 0) parts.push(`ได้อย่างน้อย ${fmt(policy.floor)}%`)
  return parts.join(' · ')
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
