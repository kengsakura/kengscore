import type { LatePolicy } from '@/lib/api/types'
import { computeScore, describePolicy } from '@/lib/scoring'
import { addDays, cn, fmtScore } from '@/lib/utils'
import { Checkbox, ChipGroup, Field, Input, Select } from '@/components/ui/Form'

export function LatePolicyForm({ value: valueIn, onChange, hideOff }: { value: LatePolicy; onChange: (p: LatePolicy) => void; hideOff?: boolean }) {
  const value = hideOff && valueIn.mode === 'none' ? { ...valueIn, mode: 'percent' as const } : valueIn
  const set = (patch: Partial<LatePolicy>) => onChange({ ...value, ...patch })
  const num = (s: string) => (s === '' ? 0 : Math.max(0, Number(s)))
  const off = value.mode === 'none'
  const unit = value.per === 'day' ? (value.weekdaysOnly ? 'วันทำการ' : 'วัน') : 'สัปดาห์'

  const sampleMax = 10
  const samples = value.per === 'day' ? [0, 1, 2, 3, 5, 7] : [0, 1, 2, 3, 4]
  const base = '2026-01-05'

  return (
    <div className="space-y-4">
      <ChipGroup
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          ...(hideOff ? [] : [{ value: 'none' as const, label: 'ไม่หักคะแนน' }]),
          { value: 'percent' as const, label: 'หักเป็น %' },
          { value: 'points' as const, label: 'หักเป็นคะแนน' },
        ]}
      />
      <div className={cn('space-y-4', off && 'pointer-events-none opacity-40')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={value.mode === 'points' ? 'หักครั้งละ (คะแนน)' : 'หักครั้งละ (%)'}>
            <Input type="number" min={0} step="any" inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: num(e.target.value) })} />
          </Field>
          <Field label="ทุก ๆ">
            <Select value={value.per} onChange={(e) => set({ per: e.target.value as LatePolicy['per'] })}>
              <option value="day">วันที่ส่งช้า</option>
              <option value="week">สัปดาห์ที่ส่งช้า</option>
            </Select>
          </Field>
          <Field label={`ผ่อนผัน (${unit})`} hint="ไม่หักในช่วงแรก">
            <Input type="number" min={0} step={1} inputMode="numeric" value={value.grace} onChange={(e) => set({ grace: Math.floor(num(e.target.value)) })} />
          </Field>
          <Field label="ได้อย่างน้อย (%)" hint="ของคะแนนที่ทำได้">
            <Input type="number" min={0} max={100} inputMode="numeric" value={value.floor} onChange={(e) => set({ floor: Math.min(100, num(e.target.value)) })} />
          </Field>
        </div>
        <Checkbox
          label="นับเฉพาะวันจันทร์–ศุกร์"
          description="ส่งวันจันทร์ของงานที่กำหนดส่งวันศุกร์ = ช้า 1 วัน"
          checked={value.weekdaysOnly}
          onChange={(e) => set({ weekdaysOnly: e.target.checked })}
        />
        <Field label="การปัดเศษคะแนนสุทธิ">
          <Select value={value.round} onChange={(e) => set({ round: e.target.value as LatePolicy['round'] })}>
            <option value="none">ไม่ปัด (ทศนิยม 2 ตำแหน่ง)</option>
            <option value="half">ปัดเป็น .5</option>
            <option value="int">ปัดเป็นจำนวนเต็ม</option>
          </Select>
        </Field>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70 ring-inset">
        <div className="text-xs font-medium text-slate-600">{describePolicy(value)}</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {samples.map((n) => {
            const r = computeScore(sampleMax, base, addDays(base, value.per === 'day' ? n : n * 7), { ...value, weekdaysOnly: false })
            return (
              <div key={n} className="rounded-lg bg-white px-2 py-1.5 text-center ring-1 ring-slate-200/70">
                <div className="text-[11px] text-slate-500">{n === 0 ? 'ตรงเวลา' : `ช้า ${n} ${value.per === 'day' ? 'วัน' : 'สัปดาห์'}`}</div>
                <div className={cn('tabular text-sm font-semibold', r.final < sampleMax ? 'text-amber-700' : 'text-emerald-700')}>
                  {fmtScore(r.final)}/{sampleMax}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
