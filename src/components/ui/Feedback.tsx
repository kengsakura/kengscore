import { useId, type ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn, errorMessage } from '@/lib/utils'
import { Button } from './Button'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-indigo-500', className)} />
}

export function FullScreenLoader({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-slate-500">
      <Logo className="size-12" />
      <div className="flex items-center gap-2 text-sm">
        <Spinner className="size-4" /> {label}
      </div>
    </div>
  )
}

export function FullScreenError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-card ring-1 ring-slate-200">
        <AlertTriangle className="mx-auto size-10 text-amber-500" />
        <h1 className="mt-3 text-lg font-semibold">โหลดข้อมูลไม่สำเร็จ</h1>
        <p className="mt-1 text-sm break-words text-slate-500">{errorMessage(error)}</p>
        {onRetry && (
          <Button className="mt-4" variant="primary" onClick={onRetry}>
            ลองใหม่
          </Button>
        )}
      </div>
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="size-6" />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="mb-3 rounded-2xl bg-indigo-50 p-3 text-indigo-600 [&>svg]:size-7">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  const gid = useId()
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <path d="M18 33l9 9 19-21" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
