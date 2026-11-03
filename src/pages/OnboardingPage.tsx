import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { getApi } from '@/lib/api'
import { qk } from '@/hooks/queries'
import { Button } from '@/components/ui/Button'
import { ChipGroup, Field, Input } from '@/components/ui/Form'
import { Logo } from '@/components/ui/Feedback'
import { errorMessage, suggestTerm } from '@/lib/utils'

/** ตั้งค่าครั้งแรก: ชื่อผู้สอน + ภาคเรียนที่ทำงาน */
export default function OnboardingPage() {
  const qc = useQueryClient()
  const suggested = suggestTerm()
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [year, setYear] = useState(String(suggested.academic_year))
  const [semester, setSemester] = useState(suggested.semester)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2400 || y > 2800) return toast.error('ปีการศึกษาให้ใส่เป็น พ.ศ. เช่น 2569')
    setBusy(true)
    try {
      const api = getApi()
      const existing = (await api.listTerms()).find((t) => t.academic_year === y && t.semester === semester)
      const term = existing ?? (await api.createTerm({ academic_year: y, semester }))
      await api.updateSettings({ active_term_id: term.id, teacher_name: name.trim(), school_name: school.trim() })
      await Promise.all([qc.invalidateQueries({ queryKey: qk.settings }), qc.invalidateQueries({ queryKey: qk.terms })])
      toast.success('พร้อมใช้งานแล้ว')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl bg-white p-6 shadow-pop ring-1 ring-slate-200/80">
        <div className="flex items-center gap-3">
          <Logo className="size-11" />
          <div>
            <h1 className="flex items-center gap-1.5 text-lg font-bold">
              ยินดีต้อนรับ <Sparkles className="size-4 text-amber-500" />
            </h1>
            <p className="text-sm text-slate-500">ตั้งค่าเริ่มต้นก่อนใช้งาน (แก้ภายหลังได้ในหน้าตั้งค่า)</p>
          </div>
        </div>
        <Field label="ชื่อผู้สอน" htmlFor="teacher">
          <Input id="teacher" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ครูสมศรี ใจดี" />
        </Field>
        <Field label="โรงเรียน" htmlFor="school">
          <Input id="school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="ไม่บังคับ" />
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="ปีการศึกษา" htmlFor="year">
            <Input id="year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} required />
          </Field>
          <Field label="ภาคเรียน">
            <ChipGroup
              value={semester}
              onChange={setSemester}
              options={[
                { value: 1, label: 'ภาค 1' },
                { value: 2, label: 'ภาค 2' },
                { value: 3, label: 'ฤดูร้อน' },
              ]}
            />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          เริ่มใช้งาน
        </Button>
      </form>
    </div>
  )
}
