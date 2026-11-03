import { Database, FlaskConical } from 'lucide-react'
import { setDemoMode } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Feedback'

/** แสดงเมื่อยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / KEY */
export default function SetupPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-11" />
          <div>
            <h1 className="text-xl font-bold">KengScore</h1>
            <p className="text-sm text-slate-500">ยังไม่ได้เชื่อมต่อฐานข้อมูล</p>
          </div>
        </div>
        <div className="space-y-5 rounded-3xl bg-white p-6 shadow-pop ring-1 ring-slate-200/80">
          <div className="flex gap-3">
            <Database className="mt-0.5 size-5 shrink-0 text-indigo-600" />
            <div className="space-y-2 text-sm text-slate-600">
              <p className="font-medium text-slate-900">เชื่อมต่อ Supabase</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>สร้างโปรเจกต์ที่ supabase.com เลือก Region <b>Southeast Asia (Singapore)</b></li>
                <li>เปิด SQL Editor แล้วรันไฟล์ <code className="rounded bg-slate-100 px-1">supabase/migrations/*.sql</code></li>
                <li>
                  ตั้งค่า Environment Variables (ใน Vercel หรือ <code className="rounded bg-slate-100 px-1">.env.local</code>):
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {'VITE_SUPABASE_URL=https://xxxx.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...'}
                  </pre>
                </li>
                <li>Deploy ใหม่ (หรือรัน npm run dev ใหม่)</li>
              </ol>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <Button variant="primary" className="w-full" size="lg" icon={<FlaskConical className="size-4" />} onClick={() => setDemoMode(true)}>
              ลองใช้โหมดสาธิตก่อน
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500">มีข้อมูลตัวอย่างให้ลองใช้ เก็บไว้ในเบราว์เซอร์นี้เท่านั้น</p>
          </div>
        </div>
      </div>
    </div>
  )
}
