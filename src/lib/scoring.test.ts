import { describe, expect, it } from 'vitest'
import { computeScore, DEFAULT_LATE_POLICY, describePolicy, lateDays } from './scoring'
import type { LatePolicy } from './api/types'

const P = (o: Partial<LatePolicy> = {}): LatePolicy => ({ ...DEFAULT_LATE_POLICY, ...o })

describe('lateDays', () => {
  it('ส่งตรงเวลาหรือก่อนกำหนด = 0', () => {
    expect(lateDays('2026-11-03', '2026-11-03', true)).toBe(0)
    expect(lateDays('2026-11-03', '2026-11-01', false)).toBe(0)
  })
  it('นับวันปฏิทิน', () => {
    expect(lateDays('2026-11-03', '2026-11-10', false)).toBe(7)
  })
  it('นับเฉพาะวันจันทร์–ศุกร์: กำหนดศุกร์ ส่งจันทร์ = ช้า 1 วัน', () => {
    // 2026-11-06 = ศุกร์, 2026-11-09 = จันทร์
    expect(lateDays('2026-11-06', '2026-11-09', true)).toBe(1)
    expect(lateDays('2026-11-06', '2026-11-07', true)).toBe(0) // ส่งวันเสาร์
    expect(lateDays('2026-11-03', '2026-11-17', true)).toBe(10)
  })
  it('ข้ามเดือน/ปี', () => {
    expect(lateDays('2026-12-30', '2027-01-02', false)).toBe(3)
  })
})

describe('computeScore', () => {
  it('ตรงเวลาได้คะแนนเต็มที่ทำได้', () => {
    expect(computeScore(8, '2026-11-03', '2026-11-03', P()).final).toBe(8)
  })
  it('หัก 10% ต่อวัน', () => {
    const r = computeScore(10, '2026-11-03', '2026-11-05', P({ weekdaysOnly: false }))
    expect(r.final).toBe(8)
    expect(r.lateDays).toBe(2)
    expect(r.deducted).toBe(2)
  })
  it('ไม่ต่ำกว่า floor', () => {
    expect(computeScore(10, '2026-11-03', '2026-12-30', P()).final).toBe(5)
  })
  it('หักเป็นคะแนนต่อวัน', () => {
    expect(computeScore(10, '2026-11-02', '2026-11-05', P({ mode: 'points', amount: 1 })).final).toBe(7)
  })
  it('ต่อสัปดาห์ + ผ่อนผัน', () => {
    const p = P({ per: 'week', amount: 20, grace: 1, weekdaysOnly: false })
    expect(computeScore(10, '2026-11-01', '2026-11-05', p).final).toBe(10) // สัปดาห์แรกผ่อนผัน
    expect(computeScore(10, '2026-11-01', '2026-11-10', p).final).toBe(8) // สัปดาห์ที่ 2 หัก 20%
  })
  it('ยกเว้น (exempt) ไม่หัก', () => {
    expect(computeScore(10, '2026-11-01', '2026-11-20', P(), true).final).toBe(10)
  })
  it('ไม่หักเมื่อ mode = none', () => {
    expect(computeScore(9, '2026-11-01', '2026-11-20', P({ mode: 'none' })).final).toBe(9)
  })
  it('ปัดเศษ 0.5 และจำนวนเต็ม', () => {
    const base = { weekdaysOnly: false, amount: 15 }
    expect(computeScore(7, '2026-11-01', '2026-11-02', P({ ...base, round: 'half' })).final).toBe(6) // 5.95 → 6
    expect(computeScore(7, '2026-11-01', '2026-11-02', P({ ...base, round: 'none' })).final).toBe(5.95)
    expect(computeScore(7, '2026-11-01', '2026-11-02', P({ ...base, round: 'int' })).final).toBe(6)
  })
  it('คำอธิบายนโยบาย', () => {
    expect(describePolicy(P())).toContain('10%')
    expect(describePolicy(P({ mode: 'none' }))).toBe('ไม่หักคะแนนส่งช้า')
  })
})
