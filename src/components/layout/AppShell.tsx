import { NavLink, Outlet, useNavigate } from 'react-router'
import { BookOpen, ChevronDown, ClipboardCheck, FlaskConical, Home, LogOut, Settings, Sheet, Users } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { setDemoMode } from '@/lib/api'
import { ARTIFACT } from '@/lib/env'
import { cn, termLabel } from '@/lib/utils'
import { Logo } from '@/components/ui/Feedback'

const NAV = [
  { to: '/', label: 'หน้าหลัก', short: 'หน้าหลัก', icon: Home, end: true },
  { to: '/scores', label: 'กรอกคะแนน', short: 'กรอกคะแนน', icon: ClipboardCheck },
  { to: '/summary', label: 'คะแนนรวม', short: 'คะแนนรวม', icon: Sheet },
  { to: '/students', label: 'นักเรียน', short: 'นักเรียน', icon: Users },
  { to: '/subjects', label: 'รายวิชาและห้อง', short: 'รายวิชา', icon: BookOpen },
]

function TermSelect({ className }: { className?: string }) {
  const { terms, term, setActiveTerm } = useApp()
  const navigate = useNavigate()
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label="ภาคเรียนที่กำลังทำงาน"
        value={term.id}
        onChange={(e) => {
          if (e.target.value === '__new') navigate('/settings#terms')
          else setActiveTerm(e.target.value)
        }}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg bg-indigo-50 pr-8 pl-3 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100 ring-inset focus:ring-2 focus:ring-indigo-500 focus:outline-none"
      >
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            ภาค {termLabel(t)}
          </option>
        ))}
        <option value="__new">+ เพิ่มภาคเรียน…</option>
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-indigo-500" />
    </div>
  )
}

export default function AppShell() {
  const { settings, demo } = useApp()
  const { email, signOut } = useAuth()

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar (desktop) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <Logo className="size-9" />
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight">KengScore</div>
            <div className="text-xs text-slate-500">บันทึกคะแนนการส่งงาน</div>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="mb-1 px-1 text-[11px] font-medium tracking-wide text-slate-400 uppercase">ภาคเรียนที่ทำงาน</div>
          <TermSelect className="w-full" />
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <Icon className="size-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )
            }
          >
            <Settings className="size-4.5" />
            ตั้งค่า
          </NavLink>
          <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white">
              {(settings.teacher_name || email || 'ค').replace(/^ครู/, '').charAt(0)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{settings.teacher_name || 'ผู้สอน'}</div>
              <div className="truncate text-xs text-slate-500">{demo ? 'โหมดสาธิต' : email}</div>
            </div>
            <button
              type="button"
              hidden={ARTIFACT}
              onClick={() => (demo ? setDemoMode(false) : signOut())}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title={demo ? 'ออกจากโหมดสาธิต' : 'ออกจากระบบ'}
              aria-label={demo ? 'ออกจากโหมดสาธิต' : 'ออกจากระบบ'}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200/80 bg-white/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-lg lg:hidden">
        <div className="flex h-14 flex-1 items-center gap-2">
          <Logo className="size-8" />
          <span className="text-base font-bold tracking-tight">KengScore</span>
        </div>
        <TermSelect />
        <NavLink
          to="/settings"
          aria-label="ตั้งค่า"
          className={({ isActive }) =>
            cn('rounded-lg p-2', isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')
          }
        >
          <Settings className="size-5" />
        </NavLink>
      </header>

      {demo && (
        <div className="no-print flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 ring-1 ring-amber-100">
          <FlaskConical className="size-3.5 shrink-0" />
          โหมดสาธิต — ข้อมูลเก็บไว้ในเบราว์เซอร์นี้เท่านั้น
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-indigo-600' : 'text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('rounded-full px-4 py-1 transition-colors', isActive && 'bg-indigo-50')}>
                  <Icon className="size-5" />
                </span>
                {short}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
