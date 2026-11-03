import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseApi } from './supabase'

/** จำลองเซิร์ฟเวอร์: บันทึก request ทุกตัว แล้วตอบตามที่กำหนด */
function mockClient(respond: (url: URL, init: RequestInit) => unknown = () => []) {
  const calls: { method: string; url: URL; body: unknown; headers: Headers }[] = []
  const fetchMock = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init.headers)
    calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined, headers })
    const data = respond(url, init)
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const sb = createClient('https://demo.supabase.co', 'sb_publishable_test', {
    global: { fetch: fetchMock as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { sb, calls, api: createSupabaseApi(sb) }
}

describe('Supabase API (request shape)', () => {
  it('listSubmissions กรองตามรายวิชาผ่าน inner join และนักเรียนในห้อง', async () => {
    const { api, calls } = mockClient(() => [
      { id: 'x', assignment_id: 'a1', student_id: 's1', raw_score: '9.50', submitted_on: '2026-11-03', exempt: false, note: '', assignments: { subject_id: 'sub' } },
    ])
    const rows = await api.listSubmissions('sub', ['s1', 's2'])
    expect(rows).toEqual([{ id: 'x', assignment_id: 'a1', student_id: 's1', raw_score: 9.5, submitted_on: '2026-11-03', exempt: false, note: '' }])
    const c = calls[0]
    expect(c.url.pathname).toBe('/rest/v1/submissions')
    expect(c.url.searchParams.get('select')).toContain('assignments!inner(subject_id)')
    expect(c.url.searchParams.get('assignments.subject_id')).toBe('eq.sub')
    expect(c.url.searchParams.get('student_id')).toBe('in.(s1,s2)')
  })

  it('ดึงข้อมูลเกิน 1000 แถวด้วยการแบ่งหน้า', async () => {
    let n = 0
    const { api, calls } = mockClient(() => {
      n++
      const size = n === 1 ? 1000 : 5
      return Array.from({ length: size }, (_, i) => ({ id: `${n}-${i}`, term_id: 't', classroom_id: 'c', number: i, student_code: '', prefix: '', first_name: 'a', last_name: '' }))
    })
    const rows = await api.listStudents('t')
    expect(rows).toHaveLength(1005)
    expect(calls).toHaveLength(2)
    expect(calls[1].url.searchParams.get('offset')).toBe('1000')
  })

  it('saveSubmissions upsert ตาม (assignment_id, student_id)', async () => {
    const { api, calls } = mockClient((_u, init) => JSON.parse(String(init.body)).map((r: object, i: number) => ({ id: `id${i}`, ...r })))
    const row = { assignment_id: 'a', student_id: 's', raw_score: 10, submitted_on: '2026-11-03', exempt: false, note: '' }
    const saved = await api.saveSubmissions([row])
    expect(saved[0]).toMatchObject({ id: 'id0', raw_score: 10 })
    const c = calls[0]
    expect(c.method).toBe('POST')
    expect(c.url.searchParams.get('on_conflict')).toBe('assignment_id,student_id')
    expect(c.headers.get('prefer')).toContain('resolution=merge-duplicates')
    expect(c.body).toEqual([row])
  })

  it('listSubjects แปลง subject_classrooms เป็น classroom_ids', async () => {
    const { api, calls } = mockClient(() => [
      { id: 's', term_id: 't', code: 'ว1', name: 'วิทย์', color: 'indigo', full_score: '70.00', subject_classrooms: [{ classroom_id: 'c1' }, { classroom_id: 'c2' }] },
    ])
    const [s] = await api.listSubjects('t')
    expect(s.classroom_ids).toEqual(['c1', 'c2'])
    expect(s.full_score).toBe(70)
    expect(calls[0].url.searchParams.get('select')).toContain('subject_classrooms(classroom_id)')
  })

  it('setDueDate: null = ลบ override, มีค่า = upsert ตาม PK', async () => {
    const { api, calls } = mockClient(() => [])
    await api.setDueDate('a', 'c', null)
    await api.setDueDate('a', 'c', '2026-11-05')
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].url.searchParams.get('assignment_id')).toBe('eq.a')
    expect(calls[0].url.searchParams.get('classroom_id')).toBe('eq.c')
    expect(calls[1].method).toBe('POST')
    expect(calls[1].url.searchParams.get('on_conflict')).toBe('assignment_id,classroom_id')
  })

  it('getSettings สร้างแถวใหม่เมื่อยังไม่มี', async () => {
    const { api, calls } = mockClient((_u, init) =>
      init.method === 'POST'
        ? { active_term_id: null, teacher_name: '', school_name: '', categories: ['สมุด'], late_policy: { mode: 'none' } }
        : [],
    )
    const s = await api.getSettings()
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST'])
    expect(s.late_policy.mode).toBe('none')
    expect(s.late_policy.floor).toBe(50) // เติมค่า default ที่ขาด
  })

  it('getStudentReport เรียก RPC student_report และแยกผล ok / not_found / disabled', async () => {
    const report = {
      student: { prefix: '', first_name: 'ก', last_name: '', number: 1, student_code: '1', grade: 'ม.1', room: '1' },
      term: { academic_year: 2569, semester: 2 },
      teacher_name: '', school_name: '', late_policy: { mode: 'none' }, categories: [],
      subjects: [{ id: 's', code: '', name: 'วิทย์', color: 'indigo', full_score: null, assignments: [
        { id: 'a', category: 'ใบงาน', title: 'ง1', max_score: '10.00', due_date: '2026-11-03', late_policy: null, created_at: '', submission: { raw_score: '9.50', submitted_on: '2026-11-03', exempt: false } },
      ] }],
    }
    let reply: unknown = report
    const { api, calls } = mockClient(() => reply)
    const ok = await api.getStudentReport('K7M2-QX9P')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url.pathname).toBe('/rest/v1/rpc/student_report')
    expect(calls[0].body).toEqual({ p_code: 'K7M2-QX9P' })
    expect(ok.status).toBe('ok')
    if (ok.status === 'ok') expect(ok.report.subjects[0].assignments[0].submission?.raw_score).toBe(9.5)
    reply = null
    expect((await api.getStudentReport('AAAA-BBBB')).status).toBe('not_found')
    reply = { disabled: true }
    expect((await api.getStudentReport('AAAA-BBBB')).status).toBe('disabled')
  })

  it('regenerateAccessCodes เรียก RPC พร้อมรายการนักเรียน', async () => {
    const { api, calls } = mockClient(() => null)
    await api.regenerateAccessCodes(['s1', 's2'])
    expect(calls[0].url.pathname).toBe('/rest/v1/rpc/regenerate_access_codes')
    expect(calls[0].body).toEqual({ p_student_ids: ['s1', 's2'] })
  })
})
