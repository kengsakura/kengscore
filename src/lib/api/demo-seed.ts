import { addDays, todayISO } from '../utils'
import { genAccessCode } from '../access'
import type { Assignment, Classroom, Student, Submission } from './types'
import type { LocalDB } from './local'

/** ข้อมูลตัวอย่างสำหรับโหมดสาธิต (รายชื่อสมมติทั้งหมด) */
const BOYS = ['ธนกร', 'ภูมิพัฒน์', 'ปัณณวิชญ์', 'กิตติพัศ', 'ณัฐวุฒิ', 'ธีรภัทร', 'พีรพล', 'วรเมธ', 'ศุภกร', 'อนุชิต', 'ชยพล', 'ปกรณ์', 'รัชชานนท์', 'สิรวิชญ์', 'ธนภัทร', 'กฤษณะ', 'ภาคิน', 'จิรายุ']
const GIRLS = ['กัญญาณัฐ', 'ณัฐณิชา', 'พิมพ์ชนก', 'ปุณยวีร์', 'ชนิดา', 'ธนพร', 'ศิริประภา', 'อรปรียา', 'วริศรา', 'ภัทรวดี', 'กมลชนก', 'สุชานันท์', 'เบญญาภา', 'ปาริชาต', 'นภัสสร', 'ฐิติมา', 'อชิรญาณ์', 'พัชราภา']
const LAST = ['ใจดี', 'ศรีสุข', 'วงศ์ไทย', 'บุญมา', 'แก้วประเสริฐ', 'ทองคำ', 'สุขสวัสดิ์', 'รุ่งเรือง', 'พงษ์ศิริ', 'มณีวงศ์', 'ศักดิ์สิทธิ์', 'จันทร์เพ็ญ', 'อินทร์แก้ว', 'ชัยมงคล', 'บุญเรือง', 'สมบูรณ์ชัย', 'ประเสริฐสุข', 'เกียรติวงศ์', 'ศรีวิไล', 'นาคสวัสดิ์']

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export function seedDemo(db: LocalDB): LocalDB {
  const rand = rng(2569)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const today = todayISO()
  const id = (p: string, n: number) => `00000000-0000-4000-8000-${p}${String(n).padStart(12 - p.length, '0')}`

  const termId = id('a', 1)
  const prevTermId = id('a', 2)
  db.terms = [
    { id: prevTermId, academic_year: 2569, semester: 1, created_at: '2026-05-10T00:00:00Z' },
    { id: termId, academic_year: 2569, semester: 2, created_at: '2026-11-01T00:00:00Z' },
  ]
  db.settings = { ...db.settings, active_term_id: termId, teacher_name: 'ครูตัวอย่าง', school_name: 'โรงเรียนสาธิต' }

  const rooms: Classroom[] = [
    { id: id('c', 1), term_id: termId, grade: 'ม.1', room: '1' },
    { id: id('c', 2), term_id: termId, grade: 'ม.1', room: '2' },
    { id: id('c', 3), term_id: termId, grade: 'ม.2', room: '1' },
  ]
  db.classrooms = rooms

  const students: Student[] = []
  let code = 36001
  rooms.forEach((room, ri) => {
    const count = 16 + ri * 2
    for (let n = 1; n <= count; n++) {
      const boy = n <= Math.ceil(count / 2)
      students.push({
        id: id('s', ri * 100 + n),
        term_id: termId,
        classroom_id: room.id,
        number: n,
        student_code: String(code++ - (room.grade === 'ม.2' ? 1000 : 0)),
        prefix: boy ? 'ด.ช.' : 'ด.ญ.',
        first_name: pick(boy ? BOYS : GIRLS),
        last_name: pick(LAST),
        access_code: genAccessCode(),
      })
    }
  })
  db.students = students

  db.subjects = [
    { id: id('b', 1), term_id: termId, code: 'ว21102', name: 'วิทยาศาสตร์ 2', color: 'indigo', full_score: 70 },
    { id: id('b', 2), term_id: termId, code: 'ว22102', name: 'วิทยาศาสตร์ 4', color: 'emerald', full_score: 70 },
  ]
  db.subject_classrooms = [
    { subject_id: id('b', 1), classroom_id: rooms[0].id },
    { subject_id: id('b', 1), classroom_id: rooms[1].id },
    { subject_id: id('b', 2), classroom_id: rooms[2].id },
  ]

  const plan: [string, string, number, number][] = [
    ['สมุด', 'สมุดที่ 1', 5, -16],
    ['ใบงาน', 'ใบงานที่ 1', 10, -14],
    ['ใบงาน', 'ใบงานที่ 2', 10, -9],
    ['สอบเก็บคะแนน', 'สอบย่อยบทที่ 1', 20, -7],
    ['ชิ้นงาน', 'ชิ้นงานที่ 1 แบบจำลองเซลล์', 15, -3],
    ['ใบงาน', 'ใบงานที่ 3', 10, 0],
  ]
  const assignments: Assignment[] = []
  const submissions: Submission[] = []
  let subN = 1
  db.subjects.forEach((subject, si) => {
    plan.forEach(([category, title, max, offset], i) => {
      if (si === 1 && i === 4) return
      const a: Assignment = {
        id: id('d', si * 100 + i + 1),
        subject_id: subject.id,
        category,
        title,
        max_score: max,
        due_date: addDays(today, offset),
        late_policy: null,
        created_at: new Date(Date.now() + (offset - 1) * 86_400_000).toISOString(),
      }
      assignments.push(a)
      const roomIds = db.subject_classrooms.filter((x) => x.subject_id === subject.id).map((x) => x.classroom_id)
      for (const s of students.filter((st) => roomIds.includes(st.classroom_id))) {
        const r = rand()
        // งานล่าสุดยังส่งไม่ครบ
        const missChance = offset === 0 ? 0.55 : offset >= -3 ? 0.2 : 0.06
        if (r < missChance) continue
        const late = rand() < 0.18 && offset < 0 ? 1 + Math.floor(rand() * Math.min(5, -offset)) : 0
        const raw = category === 'สอบเก็บคะแนน' ? Math.max(6, Math.round(max * (0.45 + rand() * 0.55))) : rand() < 0.75 ? max : max - 1 - Math.floor(rand() * 3)
        submissions.push({
          id: id('e', subN++),
          assignment_id: a.id,
          student_id: s.id,
          raw_score: raw,
          submitted_on: addDays(a.due_date, late),
          exempt: false,
          note: '',
        })
      }
    })
  })
  db.assignments = assignments
  db.submissions = submissions
  return db
}
