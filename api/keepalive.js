// Vercel Cron เรียกวันละครั้ง (ดู vercel.json → crons) เพื่อไม่ให้ Supabase แพ็กเกจฟรี pause
// เพราะไม่มีการใช้งานเกิน 7 วัน — เรียก RPC student_report ด้วยรหัสปลอม ให้ Postgres ได้รันคิวรีจริง
export async function GET() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    return Response.json({ ok: false, error: 'missing Supabase env' }, { status: 500 })
  }
  const res = await fetch(`${url}/rest/v1/rpc/student_report`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: 'KEEPALIVE' }),
  })
  return Response.json(
    { ok: res.ok, status: res.status, at: new Date().toISOString() },
    { status: res.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
  )
}
