import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { Input } from './Form'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-y-auto bg-transparent p-0"
    >
      {open && (
        <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <div
            className={cn(
              'dialog-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop sm:rounded-2xl',
              { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size],
            )}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="ปิด"
                className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}

interface ConfirmOptions {
  title: ReactNode
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  /** ต้องพิมพ์ข้อความนี้ก่อนยืนยัน (สำหรับการลบสำคัญ) */
  typeToConfirm?: string
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>
const ConfirmCtx = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx)
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return fn
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise<boolean>((resolve) => {
        setTyped('')
        setState({ ...o, resolve })
      }),
    [],
  )
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const blocked = !!state?.typeToConfirm && typed.trim() !== state.typeToConfirm
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title}
        footer={
          <>
            <Button onClick={() => close(false)}>{state?.cancelText ?? 'ยกเลิก'}</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus>
              {state?.confirmText ?? 'ยืนยัน'}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-slate-600">{state.message}</div>}
        {state?.typeToConfirm && (
          <div className="mt-4 space-y-1.5">
            <p className="text-sm text-slate-600">
              พิมพ์ <b className="text-slate-900">{state.typeToConfirm}</b> เพื่อยืนยัน
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  )
}
