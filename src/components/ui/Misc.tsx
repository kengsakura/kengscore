import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'gray' | 'indigo' | 'green' | 'amber' | 'red' | 'violet' | 'sky'
const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
}

export function Badge({ tone = 'gray', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80', className)}>{children}</div>
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: string
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 flex-[1_1_15rem] items-start gap-2">
        {back && (
          <Link
            to={back}
            aria-label="ย้อนกลับ"
            className="no-print -ml-2 mt-0.5 rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900"
          >
            <ChevronLeft className="size-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  className?: string
}) {
  return (
    <div className={cn('scrollbar-thin flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
          {o.count != null && (
            <span
              className={cn(
                'tabular rounded-md px-1.5 text-xs',
                value === o.value ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200/70 text-slate-500',
              )}
            >
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({ value, max, className, tone = 'indigo' }: { value: number; max: number; className?: string; tone?: 'indigo' | 'green' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-slate-100', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', tone === 'green' ? 'bg-emerald-500' : 'bg-indigo-500')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export interface MenuItem {
  label: ReactNode
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  hidden?: boolean
}

/** เมนูสามจุด */
export function Menu({ items, label = 'ตัวเลือก', className }: { items: MenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreHorizontal className="size-4.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-slate-200">
          {items
            .filter((i) => !i.hidden)
            .map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpen(false)
                  item.onClick()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm [&>svg]:size-4',
                  item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export const SUBJECT_COLORS: Record<string, { dot: string; strip: string; soft: string; text: string }> = {
  indigo: { dot: 'bg-indigo-500', strip: 'from-indigo-500 to-violet-500', soft: 'bg-indigo-50', text: 'text-indigo-700' },
  emerald: { dot: 'bg-emerald-500', strip: 'from-emerald-500 to-teal-500', soft: 'bg-emerald-50', text: 'text-emerald-700' },
  sky: { dot: 'bg-sky-500', strip: 'from-sky-500 to-cyan-500', soft: 'bg-sky-50', text: 'text-sky-700' },
  amber: { dot: 'bg-amber-500', strip: 'from-amber-400 to-orange-500', soft: 'bg-amber-50', text: 'text-amber-800' },
  rose: { dot: 'bg-rose-500', strip: 'from-rose-500 to-pink-500', soft: 'bg-rose-50', text: 'text-rose-700' },
  violet: { dot: 'bg-violet-500', strip: 'from-violet-500 to-fuchsia-500', soft: 'bg-violet-50', text: 'text-violet-700' },
  teal: { dot: 'bg-teal-500', strip: 'from-teal-500 to-emerald-500', soft: 'bg-teal-50', text: 'text-teal-700' },
  slate: { dot: 'bg-slate-500', strip: 'from-slate-500 to-slate-700', soft: 'bg-slate-100', text: 'text-slate-700' },
}

export function subjectColor(c: string) {
  return SUBJECT_COLORS[c] ?? SUBJECT_COLORS.indigo
}
