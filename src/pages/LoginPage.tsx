import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { FlaskConical, Lock, Mail } from 'lucide-react'
import { getSupabase, setDemoMode } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { Logo } from '@/components/ui/Feedback'
import { errorMessage } from '@/lib/utils'

function authError(e: unknown) {
  const msg = errorMessage(e)
  if (/Invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/Email not confirmed/i.test(msg)) return 'ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ในอีเมลก่อน'
  if (/Password should be at least/i.test(msg)) return 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'
  return msg
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const sb = getSupabase()
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err) {
      toast.error(authError(err))
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email) return toast.error('กรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน" อีกครั้ง')
    setBusy(true)
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/settings#account`,
    })
    setBusy(false)
    if (error) toast.error(authError(error))
    else setSent(`ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${email} แล้ว`)
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_10%_-10%,#e0e7ff,transparent),radial-gradient(40rem_30rem_at_110%_110%,#ede9fe,transparent)]" />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="size-14 drop-shadow-lg" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">KengScore</h1>
          <p className="mt-1 text-sm text-slate-500">บันทึกคะแนนการส่งงานนักเรียน ง่าย เร็ว ทุกอุปกรณ์</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-pop ring-1 ring-slate-200/80">
          {sent ? (
            <div className="space-y-4 text-center">
              <Mail className="mx-auto size-10 text-indigo-500" />
              <p className="text-sm text-slate-600">{sent}</p>
              <Button className="w-full" onClick={() => setSent(null)}>
                กลับไปหน้าเข้าสู่ระบบ
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="อีเมล" htmlFor="email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    placeholder="teacher@school.ac.th"
                  />
                </div>
              </Field>
              <Field label="รหัสผ่าน" htmlFor="password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    placeholder="รหัสผ่าน"
                  />
                </div>
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                เข้าสู่ระบบ
              </Button>
              <button type="button" onClick={forgot} className="block w-full text-center text-sm text-slate-500 hover:text-indigo-600">
                ลืมรหัสผ่าน?
              </button>
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDemoMode(true)}
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
        >
          <FlaskConical className="size-4" /> ทดลองใช้โหมดสาธิต
        </button>
      </div>
    </div>
  )
}
