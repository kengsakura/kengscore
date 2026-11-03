import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, parseBackup } from './backup'

const empty = () => Object.fromEntries(BACKUP_TABLES.map((t) => [t.name, []]))

describe('parseBackup', () => {
  it('รับไฟล์สำรองที่ถูกต้อง', () => {
    const b = parseBackup(JSON.stringify({ app: 'kengscore', version: 1, created_at: '2026-11-03T00:00:00Z', tables: empty() }))
    expect(b.tables.students).toEqual([])
  })
  it('ปฏิเสธไฟล์ที่ไม่ใช่ JSON หรือไม่ใช่ของแอปนี้', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, tables: empty() }))).toThrow()
  })
  it('ปฏิเสธไฟล์ที่ขาดตาราง', () => {
    const tables = empty()
    delete tables.submissions
    expect(() => parseBackup(JSON.stringify({ app: 'kengscore', version: 1, created_at: '', tables }))).toThrow(/submissions/)
  })
})
