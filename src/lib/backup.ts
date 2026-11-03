import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * สำรอง/กู้คืนข้อมูลทั้งหมดของครู (เฉพาะโหมด Supabase)
 * Supabase แพ็กเกจฟรีไม่มี backup ให้กู้เอง จึงให้ครูดาวน์โหลดเก็บไว้เป็นไฟล์ JSON
 * เรียงตารางตามลำดับ foreign key: กู้คืนตามลำดับนี้ได้เลย
 */
export const BACKUP_TABLES = [
  { name: 'terms', key: 'id' },
  { name: 'settings', key: 'owner_id' },
  { name: 'classrooms', key: 'id' },
  { name: 'students', key: 'id' },
  { name: 'subjects', key: 'id' },
  { name: 'subject_classrooms', key: 'subject_id,classroom_id' },
  { name: 'score_groups', key: 'id', optional: true },
  { name: 'assignments', key: 'id' },
  { name: 'assignment_due_dates', key: 'assignment_id,classroom_id' },
  { name: 'submissions', key: 'id' },
] as const satisfies readonly { name: string; key: string; optional?: boolean }[]

export type BackupTable = (typeof BACKUP_TABLES)[number]['name']
type Row = Record<string, unknown>

export interface Backup {
  app: 'kengscore'
  version: 1
  created_at: string
  tables: Record<BackupTable, Row[]>
}

const PAGE = 1000
const CHUNK = 500

export async function createBackup(sb: SupabaseClient): Promise<Backup> {
  const tables = {} as Record<BackupTable, Row[]>
  for (const t of BACKUP_TABLES) {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(t.name).select('*')
      for (const col of t.key.split(',')) q = q.order(col)
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error && 'optional' in t && ['42P01', 'PGRST205'].includes(error.code)) break
      if (error) throw new Error(`อ่านตาราง ${t.name} ไม่สำเร็จ: ${error.message}`)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    tables[t.name] = rows
  }
  return { app: 'kengscore', version: 1, created_at: new Date().toISOString(), tables }
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ KengScore')
  }
  const b = data as Partial<Backup>
  if (b?.app !== 'kengscore' || b.version !== 1 || typeof b.tables !== 'object' || !b.tables) {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ KengScore')
  }
  for (const t of BACKUP_TABLES) {
    if ('optional' in t && b.tables[t.name] == null) b.tables[t.name] = []
    if (!Array.isArray(b.tables[t.name])) throw new Error(`ไฟล์สำรองไม่มีตาราง ${t.name}`)
  }
  return b as Backup
}

export function backupCounts(b: Backup) {
  return {
    terms: b.tables.terms.length,
    students: b.tables.students.length,
    subjects: b.tables.subjects.length,
    assignments: b.tables.assignments.length,
    submissions: b.tables.submissions.length,
  }
}

/**
 * กู้คืนแบบรวม (upsert): แถวในไฟล์ทับของเดิมที่ id ตรงกัน แถวที่มีอยู่แต่ไม่อยู่ในไฟล์จะไม่ถูกลบ
 * owner_id ถูกแทนด้วยบัญชีปัจจุบัน เพื่อกู้เข้าบัญชี/โปรเจกต์ใหม่ได้
 */
export async function restoreBackup(sb: SupabaseClient, backup: Backup, ownerId: string, onProgress?: (table: string) => void) {
  for (const t of BACKUP_TABLES) {
    const rows = backup.tables[t.name].map((r) => ({ ...r, owner_id: ownerId }))
    if (rows.length === 0) continue
    onProgress?.(t.name)
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await sb.from(t.name).upsert(rows.slice(i, i + CHUNK), { onConflict: t.key })
      if (error) throw new Error(`กู้คืนตาราง ${t.name} ไม่สำเร็จ: ${error.message}`)
    }
  }
}
