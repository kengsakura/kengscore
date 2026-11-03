import { describe, expect, it } from 'vitest'
import { normalizeGrade, parseDelimited, parseStudents, promoteGrade, splitPrefix, toCSV } from './csv'

describe('parseDelimited', () => {
  it('อ่าน TSV จาก Excel', () => {
    expect(parseDelimited('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('อ่าน CSV ที่มีเครื่องหมายคำพูด', () => {
    expect(parseDelimited('"a,b",c\r\n"x ""y""",z')).toEqual([['a,b', 'c'], ['x "y"', 'z']])
  })
})

describe('parseStudents', () => {
  it('มีหัวตาราง ภาษาไทย', () => {
    const text = 'ชั้น\tห้อง\tเลขที่\tเลขประจำตัว\tคำนำหน้า\tชื่อ\tนามสกุล\nม.1\t2\t1\t12345\tด.ช.\tสมชาย\tใจดี'
    const { rows, hasHeader } = parseStudents(text)
    expect(hasHeader).toBe(true)
    expect(rows[0]).toMatchObject({ grade: 'ม.1', room: '2', number: 1, student_code: '12345', prefix: 'ด.ช.', first_name: 'สมชาย', last_name: 'ใจดี' })
    expect(rows[0].error).toBeUndefined()
  })
  it('ชื่อ-นามสกุลรวมคอลัมน์ + ใช้ชั้น/ห้องเริ่มต้น', () => {
    const text = 'เลขที่,เลขประจำตัว,ชื่อ-นามสกุล\n๓,22222,เด็กหญิงมานี มีนา'
    const { rows } = parseStudents(text, { grade: 'ม.2', room: '1' })
    expect(rows[0]).toMatchObject({ number: 3, student_code: '22222', prefix: 'เด็กหญิง', first_name: 'มานี', last_name: 'มีนา', grade: 'ม.2', room: '1' })
  })
  it('ไม่มีหัวตาราง 5 คอลัมน์', () => {
    const { rows } = parseStudents('1\t10001\tนาย\tก\tข', { grade: 'ม.4', room: '3' })
    expect(rows[0]).toMatchObject({ number: 1, student_code: '10001', prefix: 'นาย', first_name: 'ก', last_name: 'ข', grade: 'ม.4', room: '3' })
  })
  it('ชั้น/ห้องรวมกัน "ม.1/3"', () => {
    const { rows } = parseStudents('ชั้น,ชื่อ,นามสกุล\nม.1/3,ก,ข')
    expect(rows[0]).toMatchObject({ grade: 'ม.1', room: '3' })
  })
  it('แจ้งเตือนเมื่อไม่มีห้อง', () => {
    const { rows } = parseStudents('ชื่อ,นามสกุล\nก,ข')
    expect(rows[0].error).toBeTruthy()
  })
})

describe('helpers', () => {
  it('splitPrefix', () => {
    expect(splitPrefix('ด.ญ.สมศรี')).toEqual(['ด.ญ.', 'สมศรี'])
    expect(splitPrefix('สมศรี')).toEqual(['', 'สมศรี'])
  })
  it('normalize/promote grade', () => {
    expect(normalizeGrade('ม 1')).toBe('ม.1')
    expect(normalizeGrade('ม1')).toBe('ม.1')
    expect(promoteGrade('ม.1')).toBe('ม.2')
    expect(promoteGrade('ป.6')).toBe('ป.7')
  })
  it('toCSV มี BOM', () => {
    expect(toCSV([['a', 'b,c']])).toBe('﻿a,"b,c"')
  })
})

describe('toCSV กันสูตร Excel', () => {
  it("ใส่ ' นำหน้าข้อความที่ขึ้นต้นด้วย = + - @ แต่ไม่ยุ่งกับตัวเลข", () => {
    const out = toCSV([['=HYPERLINK("x")', '+1', '@a', 'สมชาย', -1]]).replace(/^﻿/, '')
    expect(out).toBe(`"'=HYPERLINK(""x"")",'+1,'@a,สมชาย,-1`)
  })
})
