/** Byte Order Mark: ให้ Excel อ่าน UTF-8 ภาษาไทยถูก */
const BOM = String.fromCharCode(0xfeff)

/** แยกข้อความ CSV/TSV (วางจาก Excel ได้) เป็นตาราง */
export function parseDelimited(text: string): string[][] {
  const src = (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n?/g, '\n')
  const firstLine = src.split('\n', 1)[0] ?? ''
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"' && cell === '') inQuotes = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM ให้ Excel อ่านภาษาไทยถูก
  return BOM + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export type StudentField = 'grade' | 'room' | 'number' | 'student_code' | 'prefix' | 'first_name' | 'last_name' | 'full_name'

export const STUDENT_FIELD_LABELS: Record<Exclude<StudentField, 'full_name'>, string> = {
  grade: 'ชั้น',
  room: 'ห้อง',
  number: 'เลขที่',
  student_code: 'เลขประจำตัว',
  prefix: 'คำนำหน้า',
  first_name: 'ชื่อ',
  last_name: 'นามสกุล',
}

const HEADER_ALIASES: [StudentField, RegExp][] = [
  ['grade', /^(ชั้น|ระดับชั้น|grade|level)$/i],
  ['room', /^(ห้อง|room|class)$/i],
  ['number', /^(เลขที่|ที่|no\.?|number)$/i],
  ['student_code', /^(เลขประจำตัว(นักเรียน)?|รหัส(นักเรียน)?|student\s*id|id|code)$/i],
  ['prefix', /^(คำนำหน้า(ชื่อ)?|prefix|title)$/i],
  ['full_name', /^(ชื่อ\s*-?\s*(นามสกุล|สกุล)|ชื่อ-สกุล|full\s*name)$/i],
  ['first_name', /^(ชื่อ|first\s*name|name)$/i],
  ['last_name', /^(นามสกุล|สกุล|last\s*name|surname)$/i],
]

export const DEFAULT_COLUMNS: StudentField[] = ['grade', 'room', 'number', 'student_code', 'prefix', 'first_name', 'last_name']

const PREFIXES = ['เด็กชาย', 'เด็กหญิง', 'ด.ช.', 'ด.ญ.', 'นางสาว', 'นาย', 'นาง', 'น.ส.', 'Mr.', 'Miss', 'Mrs.', 'Ms.']

/** แยกคำนำหน้าออกจากชื่อ เช่น "ด.ช.สมชาย" → ["ด.ช.", "สมชาย"] */
export function splitPrefix(name: string): [string, string] {
  const s = name.trim()
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return [p, s.slice(p.length).trim()]
  }
  return ['', s]
}

export interface ParsedStudentRow {
  grade: string
  room: string
  number: number | null
  student_code: string
  prefix: string
  first_name: string
  last_name: string
  /** ข้อความแจ้งเตือนถ้าข้อมูลไม่ครบ */
  error?: string
}

/** ตรวจหัวตาราง: คืนลำดับคอลัมน์ถ้าแถวแรกเป็นหัวตาราง */
export function detectHeader(row: string[]): StudentField[] | null {
  const mapped = row.map((h) => HEADER_ALIASES.find(([, re]) => re.test(h.trim()))?.[0] ?? null)
  const hits = mapped.filter(Boolean).length
  if (hits >= 2) return mapped.map((m) => m ?? ('skip' as StudentField))
  return null
}

/**
 * แปลงตารางเป็นรายชื่อนักเรียน
 * @param defaults ชั้น/ห้องที่ใช้เมื่อข้อมูลไม่มีคอลัมน์นั้น
 */
export function parseStudents(
  text: string,
  defaults: { grade?: string; room?: string } = {},
): { rows: ParsedStudentRow[]; columns: StudentField[]; hasHeader: boolean } {
  const table = parseDelimited(text)
  if (table.length === 0) return { rows: [], columns: DEFAULT_COLUMNS, hasHeader: false }
  const header = detectHeader(table[0])
  let columns: StudentField[]
  let body: string[][]
  if (header) {
    columns = header
    body = table.slice(1)
  } else {
    body = table
    const width = Math.max(...table.map((r) => r.length))
    // ไม่มีหัวตาราง: เดาจากจำนวนคอลัมน์
    if (width >= 7) columns = DEFAULT_COLUMNS
    else if (width === 6) columns = ['number', 'student_code', 'prefix', 'first_name', 'last_name', 'grade']
    else if (width === 5) columns = ['number', 'student_code', 'prefix', 'first_name', 'last_name']
    else if (width === 4) columns = ['number', 'student_code', 'first_name', 'last_name']
    else if (width === 3) columns = ['number', 'student_code', 'full_name']
    else columns = ['number', 'full_name']
  }

  const rows = body.map((cells): ParsedStudentRow => {
    const get = (f: StudentField) => {
      const i = columns.indexOf(f)
      return i >= 0 ? (cells[i] ?? '').trim() : ''
    }
    let prefix = get('prefix')
    let first = get('first_name')
    let last = get('last_name')
    const full = get('full_name')
    if (full && !first) {
      const [p, rest] = splitPrefix(full)
      const parts = rest.split(/\s+/)
      first = parts.shift() ?? ''
      last = parts.join(' ')
      if (!prefix) prefix = p
    } else if (!prefix && first) {
      const [p, rest] = splitPrefix(first)
      if (p) {
        prefix = p
        first = rest
      }
    }
    // ชั้นแบบ "ม.1/2" ในคอลัมน์เดียว
    let grade = get('grade') || defaults.grade || ''
    let room = get('room') || defaults.room || ''
    const combined = grade.match(/^(.+?)\s*\/\s*(\S+)$/)
    if (combined && !get('room')) {
      grade = combined[1]
      room = combined[2]
    }
    const numRaw = get('number').replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    const number = numRaw && /^\d+$/.test(numRaw) ? Number(numRaw) : null
    const row: ParsedStudentRow = {
      grade: normalizeGrade(grade),
      room,
      number,
      student_code: get('student_code').replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)),
      prefix,
      first_name: first,
      last_name: last,
    }
    if (!row.first_name) row.error = 'ไม่มีชื่อ'
    else if (!row.grade || !row.room) row.error = 'ไม่ระบุชั้น/ห้อง'
    return row
  })
  return { rows, columns, hasHeader: !!header }
}

/** "ม1" / "ม. 1" → "ม.1" */
export function normalizeGrade(g: string): string {
  const s = g.trim().replace(/\s+/g, '')
  const m = s.match(/^(ป|ม|อ|ปวช|ปวส)\.?(\d+)$/)
  if (m) return `${m[1]}.${m[2]}`
  return s
}

/** เลื่อนชั้น: "ม.1" → "ม.2" */
export function promoteGrade(g: string): string {
  const m = g.match(/^(.*?)(\d+)(\D*)$/)
  if (!m) return g
  return `${m[1]}${Number(m[2]) + 1}${m[3]}`
}
