/** รหัสดูคะแนนของนักเรียน: 8 ตัว จากอักษรที่อ่านไม่สับสน (ไม่มี I L O 0 1) */
export const ACCESS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** "K7M2QX9P" → "K7M2-QX9P" */
export function formatAccessCode(code: string): string {
  const c = normalizeAccessCode(code)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4, 8)}` : c
}

export function isValidAccessCode(input: string): boolean {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/.test(normalizeAccessCode(input))
}

/** ใช้ในโหมดสาธิต (ฐานข้อมูลจริงสุ่มรหัสเองด้วย gen_access_code) */
export function genAccessCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ACCESS_ALPHABET[b % ACCESS_ALPHABET.length]).join('')
}

/** ลิงก์หน้าคะแนนของนักเรียน */
export function portalUrl(code?: string): string {
  const base = `${window.location.origin}/s`
  return code ? `${base}/${normalizeAccessCode(code)}` : base
}
