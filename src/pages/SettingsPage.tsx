import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, CalendarRange, Check, Copy, DatabaseBackup, Download, Upload, GraduationCap, KeyRound, LogOut, Printer, RotateCcw, Tags, Timer, Trash2, UserRound, X } from 'lucide-react'
import { Link } from 'react-router'
import { portalUrl } from '@/lib/access'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { qk, useTermAssignments, useUpdateSettings } from '@/hooks/queries'
import { getApi, getSupabase, reloadHome, setDemoMode } from '@/lib/api'
import { ARTIFACT } from '@/lib/env'
import { resetDemoData } from '@/lib/api/local'
import type { LatePolicy } from '@/lib/api/types'
import { describePolicy, normalizePolicy } from '@/lib/scoring'
import { backupCounts, createBackup, parseBackup, restoreBackup } from '@/lib/backup'
import { cn, copyText, downloadFile, errorMessage, suggestTerm, termLabel, termLongLabel } from '@/lib/utils'
import { LatePolicyForm } from '@/components/LatePolicyForm'
import { Button, buttonClass } from '@/components/ui/Button'
import { ChipGroup, Field, Input } from '@/components/ui/Form'
import { Badge, Card, PageHeader } from '@/components/ui/Misc'
import { useConfirm } from '@/components/ui/Modal'

function Section({ id, icon, title, description, children }: { id?: string; icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 [&>svg]:size-5">{icon}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
    </section>
  )
}

export default function SettingsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [hash])

  return (
    <>
      <PageHeader title="ตั้งค่า" subtitle="ข้อมูลผู้สอน ภาคเรียน ประเภทงาน และการหักคะแนน" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ProfileSection />
          <TermsSection />
          <CategoriesSection />
        </div>
        <div className="space-y-4">
          <LatePolicySection />
          <PortalSection />
          <BackupSection />
          <AccountSection />
        </div>
      </div>
    </>
  )
}

function ProfileSection() {
  const { settings } = useApp()
  const update = useUpdateSettings()
  const [name, setName] = useState(settings.teacher_name)
  const [school, setSchool] = useState(settings.school_name)
  const dirty = name !== settings.teacher_name || school !== settings.school_name
  return (
    <Section icon={<UserRound />} title="ข้อมูลผู้สอน">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ teacher_name: name.trim(), school_name: school.trim() }, { onSuccess: () => toast.success('บันทึกแล้ว') })
        }}
      >
        <Field label="ชื่อผู้สอน">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ครูสมศรี ใจดี" />
        </Field>
        <Field label="โรงเรียน">
          <Input value={school} onChange={(e) => setSchool(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!dirty} loading={update.isPending}>
            บันทึก
          </Button>
        </div>
      </form>
    </Section>
  )
}

function TermsSection() {
  const { terms, term, setActiveTerm } = useApp()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const suggested = suggestTerm()
  const [year, setYear] = useState(String(suggested.academic_year))
  const [semester, setSemester] = useState(suggested.semester)
  const [busy, setBusy] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault()
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2400 || y > 2800) return toast.error('ปีการศึกษาใส่เป็น พ.ศ. เช่น 2569')
    if (terms.some((t) => t.academic_year === y && t.semester === semester)) return toast.error('มีภาคเรียนนี้อยู่แล้ว')
    setBusy(true)
    try {
      const t = await getApi().createTerm({ academic_year: y, semester })
      await qc.invalidateQueries({ queryKey: qk.terms })
      setActiveTerm(t.id)
      toast.success(`เพิ่มและเปลี่ยนไปทำงานภาค ${termLabel(t)} แล้ว`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const t = terms.find((x) => x.id === id)
    if (!t) return
    if (terms.length === 1) return toast.error('ต้องมีอย่างน้อย 1 ภาคเรียน')
    const ok = await confirm({
      title: `ลบ${termLongLabel(t)}?`,
      message: 'นักเรียน รายวิชา งาน และคะแนนทั้งหมดในภาคเรียนนี้จะถูกลบถาวร',
      confirmText: 'ลบภาคเรียน',
      danger: true,
      typeToConfirm: termLabel(t),
    })
    if (!ok) return
    try {
      await getApi().deleteTerm(id)
      if (id === term.id) setActiveTerm(terms.find((x) => x.id !== id)!.id)
      await qc.invalidateQueries({ queryKey: qk.terms })
      toast.success('ลบภาคเรียนแล้ว')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Section id="terms" icon={<CalendarRange />} title="ภาคเรียน / ปีการศึกษา" description="ข้อมูลนักเรียนและรายวิชาแยกตามภาคเรียน">
      <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {terms.map((t) => (
          <div key={t.id} className={cn('flex items-center gap-2 px-3 py-2.5', t.id === term.id && 'bg-indigo-50/50')}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{termLongLabel(t)}</div>
            </div>
            {t.id === term.id ? (
              <Badge tone="indigo">
                <Check className="size-3" /> กำลังทำงาน
              </Badge>
            ) : (
              <Button size="sm" onClick={() => setActiveTerm(t.id)}>
                ใช้ภาคนี้
              </Button>
            )}
            <button
              type="button"
              aria-label="ลบภาคเรียน"
              onClick={() => remove(t.id)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
        <Field label="ปีการศึกษา (พ.ศ.)" className="w-32">
          <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        <ChipGroup
          value={semester}
          onChange={setSemester}
          options={[
            { value: 1, label: 'ภาค 1' },
            { value: 2, label: 'ภาค 2' },
            { value: 3, label: 'ฤดูร้อน' },
          ]}
        />
        <Button type="submit" variant="primary" loading={busy} className="ml-auto">
          เพิ่มภาคเรียน
        </Button>
      </form>
    </Section>
  )
}

function CategoriesSection() {
  const { settings } = useApp()
  const update = useUpdateSettings()
  const [input, setInput] = useState('')
  const cats = settings.categories
  const save = (next: string[]) => update.mutate({ categories: next })
  const move = (i: number, d: number) => {
    const next = [...cats]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    save(next)
  }
  return (
    <Section icon={<Tags />} title="ประเภทงาน" description="ใช้ตอนสร้างงาน และเรียงคอลัมน์ในหน้าคะแนนรวม">
      <div className="space-y-1.5">
        {cats.map((c, i) => (
          <div key={c} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200/70 ring-inset">
            <span className="flex-1 text-sm font-medium">{c}</span>
            <button type="button" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
              <ArrowUp className="size-4" />
            </button>
            <button type="button" aria-label="เลื่อนลง" disabled={i === cats.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
              <ArrowDown className="size-4" />
            </button>
            <button type="button" aria-label={`ลบ ${c}`} onClick={() => save(cats.filter((x) => x !== c))} className="rounded p-1 text-slate-400 hover:text-rose-600">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = input.trim()
          if (!v) return
          if (cats.includes(v)) return toast.error('มีประเภทนี้แล้ว')
          save([...cats, v])
          setInput('')
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="เพิ่มประเภท เช่น การบ้าน, รายงาน" />
        <Button type="submit">เพิ่ม</Button>
      </form>
    </Section>
  )
}

function LatePolicySection() {
  const { settings, term } = useApp()
  const update = useUpdateSettings()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const termAssignments = useTermAssignments(term.id)
  const [policy, setPolicy] = useState<LatePolicy>(normalizePolicy(settings.late_policy))
  const saved = JSON.stringify(normalizePolicy(settings.late_policy))
  const dirty = JSON.stringify(policy) !== saved

  // บันทึกอัตโนมัติ (ไม่ต้องกดปุ่ม) — รอให้หยุดพิมพ์ครู่หนึ่งก่อน
  const { mutate } = update
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => mutate({ late_policy: policy }, { onSuccess: () => toast.success('บันทึกการหักคะแนนแล้ว', { id: 'late-policy' }) }), 500)
    return () => clearTimeout(t)
  }, [policy, dirty, mutate])

  const custom = (termAssignments.data ?? []).filter((a) => a.late_policy)
  const customDeducting = custom.filter((a) => a.late_policy?.mode !== 'none')

  async function resetCustom() {
    const ok = await confirm({
      title: `ให้ทั้ง ${custom.length} งานใช้ค่าเริ่มต้น?`,
      message: 'งานที่เคยตั้งการหักคะแนนเฉพาะไว้ (รวมถึงที่ตั้ง "ไม่หักงานนี้") จะกลับมาใช้ค่าเริ่มต้นด้านบน',
      confirmText: 'ใช้ค่าเริ่มต้นทุกงาน',
    })
    if (!ok) return
    try {
      await Promise.all(custom.map((a) => getApi().updateAssignment(a.id, { late_policy: null })))
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['assignments'] }),
        qc.invalidateQueries({ queryKey: qk.termAssignments(term.id) }),
      ])
      toast.success('ทุกงานใช้ค่าเริ่มต้นแล้ว')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Section icon={<Timer />} title="การหักคะแนนส่งช้า (ค่าเริ่มต้น)" description="ใช้กับทุกงาน ยกเว้นงานที่ตั้งค่าเฉพาะไว้ — เปลี่ยนแล้วบันทึกและคำนวณคะแนนใหม่ทันที">
      <LatePolicyForm value={policy} onChange={setPolicy} />
      <div className="mt-3 text-right text-xs text-slate-500">
        {update.isPending || dirty ? 'กำลังบันทึก…' : (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check className="size-3.5" /> บันทึกแล้ว
          </span>
        )}
      </div>
      {custom.length > 0 && (
        <div className={cn('mt-3 rounded-xl p-3 text-sm ring-1 ring-inset', customDeducting.length && policy.mode === 'none' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-50 text-slate-700 ring-slate-200')}>
          <p>
            มี <b>{custom.length}</b> งานในภาคเรียนนี้ที่ตั้งการหักคะแนนเฉพาะไว้ จึง<b>ไม่ใช้</b>ค่าเริ่มต้นนี้
            {customDeducting.length > 0 && policy.mode === 'none' && ` — ${customDeducting.length} งานยังหักคะแนนอยู่`}
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
            {custom.slice(0, 5).map((a) => (
              <li key={a.id}>
                {a.title} — {describePolicy(a.late_policy!)}
              </li>
            ))}
            {custom.length > 5 && <li>และอีก {custom.length - 5} งาน</li>}
          </ul>
          <Button size="sm" className="mt-2" onClick={resetCustom}>
            ให้ทุกงานใช้ค่าเริ่มต้น
          </Button>
        </div>
      )}
    </Section>
  )
}

function PortalSection() {
  const { settings } = useApp()
  const update = useUpdateSettings()
  const on = settings.portal_enabled
  return (
    <Section id="portal" icon={<GraduationCap />} title="นักเรียนดูคะแนนของตัวเอง" description="นักเรียนใช้รหัส 8 ตัวของตัวเองดูคะแนนและงานค้าง ไม่ต้องสมัคร">
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/70 ring-inset">
        <span>
          <span className="block text-sm font-medium">{on ? 'เปิดให้นักเรียนดูคะแนน' : 'ปิดอยู่ — นักเรียนดูคะแนนไม่ได้'}</span>
          <span className="block text-xs text-slate-500">ปิดชั่วคราวได้ เช่น ระหว่างตรวจงานหรือก่อนประกาศผล</span>
        </span>
        <span className="relative inline-flex shrink-0">
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={on}
            onChange={(e) =>
              update.mutate(
                { portal_enabled: e.target.checked },
                { onSuccess: () => toast.success(e.target.checked ? 'เปิดให้นักเรียนดูคะแนนแล้ว' : 'ปิดการดูคะแนนแล้ว') },
              )
            }
          />
          <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500" />
          <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <code className="rounded-lg bg-white px-2.5 py-1.5 font-medium text-indigo-700 ring-1 ring-slate-200 select-all">{portalUrl()}</code>
        <Button size="sm" icon={<Copy className="size-4" />} onClick={() => copyText(portalUrl(), 'คัดลอกลิงก์แล้ว')}>
          คัดลอกลิงก์
        </Button>
        <Link to="/students/slips" className={buttonClass('soft', 'sm')}>
          <Printer className="size-4" /> พิมพ์ใบรหัส + QR
        </Link>
      </div>
    </Section>
  )
}

const LAST_BACKUP_KEY = 'kengscore:last-backup'

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

function BackupSection() {
  const { demo } = useApp()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [last, setLast] = useState(readLastBackup)
  if (demo) return null

  const daysAgo = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : null
  const stale = daysAgo == null || daysAgo >= 14

  async function download() {
    setBusy('กำลังสำรองข้อมูล…')
    try {
      const backup = await createBackup(getSupabase())
      const stamp = backup.created_at.slice(0, 10)
      downloadFile(`kengscore-backup-${stamp}.json`, JSON.stringify(backup), 'application/json')
      try {
        localStorage.setItem(LAST_BACKUP_KEY, backup.created_at)
      } catch {
        /* ignore */
      }
      setLast(backup.created_at)
      const c = backupCounts(backup)
      toast.success(`สำรองแล้ว: นักเรียน ${c.students} คน · งาน ${c.assignments} ชิ้น · คะแนน ${c.submissions} รายการ`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function restore(file: File) {
    try {
      const backup = parseBackup(await file.text())
      const c = backupCounts(backup)
      const ok = await confirm({
        title: 'กู้คืนข้อมูลจากไฟล์สำรอง?',
        message: (
          <>
            <p>
              ไฟล์วันที่ {new Date(backup.created_at).toLocaleString('th-TH')} — ภาคเรียน {c.terms} · นักเรียน {c.students} คน · วิชา {c.subjects} · งาน{' '}
              {c.assignments} · คะแนน {c.submissions} รายการ
            </p>
            <p className="mt-2">ข้อมูลในไฟล์จะทับข้อมูลเดิมที่ตรงกัน ส่วนข้อมูลที่มีอยู่แต่ไม่อยู่ในไฟล์จะยังอยู่ ไม่ถูกลบ</p>
          </>
        ),
        confirmText: 'กู้คืน',
      })
      if (!ok) return
      const sb = getSupabase()
      const { data } = await sb.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) throw new Error('กรุณาเข้าสู่ระบบใหม่')
      setBusy('กำลังกู้คืน…')
      await restoreBackup(sb, backup, uid, (t) => setBusy(`กำลังกู้คืน ${t}…`))
      await qc.invalidateQueries()
      toast.success('กู้คืนข้อมูลเรียบร้อย')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section
      id="backup"
      icon={<DatabaseBackup />}
      title="สำรองข้อมูล"
      description="Supabase แพ็กเกจฟรีไม่มีระบบสำรองให้ — ดาวน์โหลดเก็บไว้เป็นระยะ (เช่น ทุกสิ้นเดือน)"
    >
      <p className={cn('mb-3 text-sm', stale ? 'text-amber-700' : 'text-slate-500')}>
        {last
          ? `สำรองล่าสุดจากเครื่องนี้: ${new Date(last).toLocaleDateString('th-TH', { dateStyle: 'medium' })}${daysAgo ? ` (${daysAgo} วันก่อน)` : ' (วันนี้)'}`
          : 'ยังไม่เคยสำรองข้อมูลจากเครื่องนี้'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Download className="size-4" />} onClick={download} loading={busy?.startsWith('กำลังสำรอง')} disabled={!!busy}>
          ดาวน์โหลดไฟล์สำรอง
        </Button>
        <label className={cn(buttonClass('soft'), busy ? 'pointer-events-none opacity-50' : 'cursor-pointer')}>
          <Upload className="size-4" /> กู้คืนจากไฟล์
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) restore(f)
            }}
          />
        </label>
      </div>
      {busy && <p className="mt-2 text-sm text-slate-500">{busy}</p>}
    </Section>
  )
}

function AccountSection() {
  const { demo } = useApp()
  const { email, signOut } = useAuth()
  const confirm = useConfirm()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (demo)
    return (
      <Section id="account" icon={<KeyRound />} title="โหมดสาธิต" description="ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ได้ส่งขึ้นเซิร์ฟเวอร์">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<RotateCcw className="size-4" />}
            onClick={async () => {
              if (await confirm({ title: 'รีเซ็ตข้อมูลตัวอย่าง?', message: 'ข้อมูลที่แก้ไขในโหมดสาธิตจะหายทั้งหมด', danger: true, confirmText: 'รีเซ็ต' })) {
                resetDemoData()
                reloadHome()
              }
            }}
          >
            รีเซ็ตข้อมูลตัวอย่าง
          </Button>
          {!ARTIFACT && (
            <Button variant="primary" icon={<LogOut className="size-4" />} onClick={() => setDemoMode(false)}>
              ออกจากโหมดสาธิต
            </Button>
          )}
        </div>
      </Section>
    )

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) return toast.error('รหัสผ่านอย่างน้อย 6 ตัวอักษร')
    setBusy(true)
    const { error } = await getSupabase().auth.updateUser({ password })
    setBusy(false)
    if (error) toast.error(errorMessage(error))
    else {
      toast.success('เปลี่ยนรหัสผ่านแล้ว')
      setPassword('')
    }
  }

  return (
    <Section id="account" icon={<KeyRound />} title="บัญชี" description={email ?? undefined}>
      <form onSubmit={changePassword} className="flex gap-2">
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่านใหม่" />
        <Button type="submit" loading={busy} disabled={!password}>
          เปลี่ยนรหัสผ่าน
        </Button>
      </form>
      <Button className="mt-4" variant="ghost" icon={<LogOut className="size-4" />} onClick={signOut}>
        ออกจากระบบ
      </Button>
    </Section>
  )
}
