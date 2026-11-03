import { useMemo } from 'react'
import { encode } from 'uqr'

/** QR code แบบ SVG (คมชัดตอนพิมพ์) */
export function QrCode({ value, className, label = 'QR code' }: { value: string; className?: string; label?: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`
      }),
    )
    return { path: d, size }
  }, [value])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#0f172a" />
    </svg>
  )
}
