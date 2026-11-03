# HANDOFF — สรุปสถานะโปรเจกต์ (สำหรับแชท/ผู้พัฒนาคนถัดไป)

> อ่านไฟล์นี้ก่อนเริ่มงาน แล้วอ่าน README.md ต่อ

## แอปนี้คืออะไร
เว็บแอปให้ครูกรอกคะแนนการส่งงานนักเรียน (ภาษาไทย)
- แยกตาม ภาคเรียน/ปีการศึกษา, จัดการนักเรียน (ชั้น ห้อง เลขที่ เลขประจำตัว คำนำหน้า ชื่อ สกุล)
- รายวิชา ↔ จับคู่ห้อง, งาน (ประเภท/ชื่องาน/คะแนนเต็ม/กำหนดส่ง รายห้องได้)
- วันที่ส่ง default = วันนี้, ส่งช้าหักคะแนนตาม late policy (ตั้งในหน้าตั้งค่า หรือรายงาน)
- หน้าคะแนนรวม (ส่งออก CSV/พิมพ์), หน้าตั้งค่า (ปี/ภาคเรียนที่ทำงาน, ชื่อครู, โรงเรียน, ประเภทงาน)
- **พอร์ทัลนักเรียน** `/student` — นักเรียนใส่รหัสเข้าดู (access code) ดูคะแนนตัวเอง, ครูพิมพ์สลิป/QR ได้

## สแตก
Vite 7 + React 19 + react-router 7 + TanStack Query 5 + Tailwind 4 + TypeScript, vitest
- `src/lib/api/` มี 2 backend: `supabase.ts` (จริง) และ `local.ts` (demo ใน localStorage — ใช้เมื่อไม่มี env Supabase)
- env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## สถานะ deploy (ณ 2026-11-03)
- **เว็บจริง:** https://kengscore-ochre.vercel.app (สำรอง: kengscore-sarawut6.vercel.app)
- Vercel team `team_YOK5JzeKX67lUCfBwBZtgVLx`, project `kengscore` (`prj_xDfch7KMy92ixISbbW0bwWhaELTP`)
  - settings: framework vite, install `npm install`, build `npm run build`, output `dist`, Node 22.x
  - env ตั้งแล้วทั้ง production/preview/development: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  - SSO protection = preview เท่านั้น (production เปิดสาธารณะ)
  - **เชื่อม Git แล้ว** กับ `kengsakura/kengscore` — push ขึ้น `main` = deploy production อัตโนมัติ, branch อื่น = preview
  - project ชั่วคราว `kengscore-files` ใช้แค่อัปโหลดไฟล์ ลบทิ้งได้
- **Supabase:** https://efevwflmxvouactpobtj.supabase.co (ภูมิภาค Singapore)
  - ต้องรัน `supabase/migrations/20261103000000_init.sql` แล้วตามด้วย `20261104000000_student_portal.sql`
  - ตั้ง Auth → URL Configuration: Site URL = https://kengscore-ochre.vercel.app, Redirect = `https://kengscore-ochre.vercel.app/**`

## GitHub
- repo เดิม `sarawutjamornniam-coder/kengscore` — บัญชีโดน flag (repo ถูกซ่อน, Actions ใช้ไม่ได้, เชื่อม Vercel ไม่ได้)
- ย้ายมา `kengsakura/kengscore` และเชื่อมกับ Vercel project `kengscore` แล้ว (2026-11-03)
- ลบ GitHub Actions `deploy.yml` ออกแล้ว เพราะ Vercel Git integration deploy ให้เอง

## คำสั่ง
```bash
npm install
npm run dev          # รันในเครื่อง (ไม่มี .env = โหมดเดโม่)
npm test             # vitest (36 tests)
npm run build
npm run build:artifact   # build ไฟล์เดียวสำหรับพรีวิว
scripts/test-db.sh   # ทดสอบ SQL/RLS กับ Postgres ในเครื่อง
```

## ผู้ใช้
ครูคนไทย คุยภาษาไทย ชอบให้ทำเร็ว ๆ ไม่ชอบกดอนุมัติหลายรอบ — รวบงานให้ใช้ tool call น้อยที่สุด
