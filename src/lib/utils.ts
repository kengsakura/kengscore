import clsx, { type ClassValue } from 'clsx'
import { toast } from 'sonner'
import { ARTIFACT } from './env'
import type { Classroom, ISODate, Student, Term } from './api/types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** วันนี้ตามเวลาเครื่อง รูปแบบ YYYY-MM-DD */
export function todayISO(d = new Date()): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

const shortFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })

/** "3 พ.ย." */
export function fmtDateShort(iso: ISODate) {
  return shortFmt.format(parseISODate(iso))
}
/** "3 พ.ย. 69" */
export function fmtDate(iso: ISODate) {
  return fullFmt.format(parseISODate(iso))
}
/** "อ. 3 พ.ย. 69" */
export function fmtDateWeekday(iso: ISODate) {
  return weekdayFmt.format(parseISODate(iso))
}

/** แสดงคะแนน ตัดทศนิยมที่ไม่จำเป็น */
export function fmtScore(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '–'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function fmtPercent(n: number) {
  return `${Math.round(n * 10) / 10}%`
}

export const thaiCollator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })

export function classroomLabel(c: Pick<Classroom, 'grade' | 'room'> | undefined | null) {
  if (!c) return '–'
  return `${c.grade}/${c.room}`
}

export function compareClassrooms(a: Classroom, b: Classroom) {
  return thaiCollator.compare(a.grade, b.grade) || thaiCollator.compare(a.room, b.room)
}

export function compareStudents(a: Student, b: Student) {
  const na = a.number ?? Number.MAX_SAFE_INTEGER
  const nb = b.number ?? Number.MAX_SAFE_INTEGER
  return na - nb || thaiCollator.compare(a.first_name, b.first_name) || thaiCollator.compare(a.last_name, b.last_name)
}

export function studentName(s: Pick<Student, 'prefix' | 'first_name' | 'last_name'>) {
  return `${s.prefix}${s.first_name} ${s.last_name}`.trim()
}

export function termLabel(t: Pick<Term, 'academic_year' | 'semester'> | undefined | null) {
  if (!t) return '–'
  return t.semester === 3 ? `ฤดูร้อน/${t.academic_year}` : `${t.semester}/${t.academic_year}`
}

export function termLongLabel(t: Pick<Term, 'academic_year' | 'semester'> | undefined | null) {
  if (!t) return '–'
  const sem = t.semester === 3 ? 'ภาคฤดูร้อน' : `ภาคเรียนที่ ${t.semester}`
  return `${sem} ปีการศึกษา ${t.academic_year}`
}

export function compareTerms(a: Term, b: Term) {
  return b.academic_year - a.academic_year || b.semester - a.semester
}

/**
 * เดาภาคเรียนปัจจุบันจากวันที่ (ปฏิทินโรงเรียนไทยทั่วไป)
 * พ.ค.–ต.ค. = ภาค 1, พ.ย.–มี.ค. = ภาค 2, เม.ย. = ภาค 2 ของปีก่อน
 */
export function suggestTerm(d = new Date()): { academic_year: number; semester: number } {
  const m = d.getMonth() + 1
  const be = d.getFullYear() + 543
  if (m >= 5 && m <= 10) return { academic_year: be, semester: 1 }
  if (m >= 11) return { academic_year: be, semester: 2 }
  return { academic_year: be - 1, semester: 2 }
}

/** แปลงข้อความเป็นตัวเลข รองรับเลขไทย */
export function parseNumber(input: string): number | null {
  const s = input
    .trim()
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "ใบงานที่ 3" จากชื่องานเดิม */
export function suggestTitle(category: string, existingTitles: string[]): string {
  const re = new RegExp(`^${escapeRegExp(category)}\\s*(?:ที่)?\\s*(\\d+)`)
  let max = 0
  for (const t of existingTitles) {
    const m = t.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${category}ที่ ${max + 1}`
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  if (ARTIFACT) {
    toast.info('หน้าตัวอย่างนี้ดาวน์โหลดไฟล์ไม่ได้ — ใช้ได้ในเวอร์ชันที่ deploy บน Vercel')
    return
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** คัดลอกข้อความ (ต้องเรียกจากการคลิก) */
export async function copyText(text: string, success = 'คัดลอกแล้ว') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(success)
  } catch {
    toast.error('คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วคัดลอกเอง')
  }
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as { message: unknown }).message)
    if (/duplicate key|unique/i.test(msg)) return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว'
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง'
    return msg
  }
  return 'เกิดข้อผิดพลาด'
}
