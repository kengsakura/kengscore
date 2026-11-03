import { Link } from 'react-router'
import { ChevronRight, Sheet, Users } from 'lucide-react'
import type { Classroom, Student, Subject } from '@/lib/api/types'
import { classroomLabel, cn } from '@/lib/utils'
import { subjectColor } from '@/components/ui/Misc'

/** การ์ดเลือก รายวิชา × ห้อง เพื่อไปกรอกคะแนน */
export function ClassCards({
  subjects,
  classrooms,
  students,
}: {
  subjects: Subject[]
  classrooms: Classroom[]
  students: Student[]
}) {
  const count = (cid: string) => students.filter((s) => s.classroom_id === cid).length
  return (
    <div className="space-y-4">
      {subjects.map((subject) => {
        const color = subjectColor(subject.color)
        const rooms = classrooms.filter((c) => subject.classroom_ids.includes(c.id))
        return (
          <section key={subject.id} className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80">
            <div className={cn('h-1 bg-gradient-to-r', color.strip)} />
            <div className="flex items-center gap-3 px-4 pt-3.5 pb-2 sm:px-5">
              <span className={cn('size-2.5 shrink-0 rounded-full', color.dot)} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-slate-900">
                  {subject.code && <span className="mr-1.5 text-slate-500">{subject.code}</span>}
                  {subject.name}
                </h3>
              </div>
              {rooms.length > 0 && (
                <Link
                  to={`/summary?subject=${subject.id}&room=${rooms[0].id}`}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
                >
                  <Sheet className="size-3.5" /> คะแนนรวม
                </Link>
              )}
            </div>
            {rooms.length === 0 ? (
              <div className="px-5 pb-4 text-sm text-slate-500">
                ยังไม่ได้เลือกห้องที่สอน —{' '}
                <Link to="/subjects" className="font-medium text-indigo-600 hover:underline">
                  จับคู่ห้อง
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3 sm:px-4 sm:pb-4 lg:grid-cols-4">
                {rooms.map((room) => (
                  <Link
                    key={room.id}
                    to={`/scores/${subject.id}/${room.id}`}
                    className="group flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/60 transition-all ring-inset hover:-translate-y-0.5 hover:bg-white hover:shadow-pop hover:ring-indigo-200"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-lg leading-tight font-semibold text-slate-900">{classroomLabel(room)}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Users className="size-3" /> {count(room.id)} คน
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-slate-300 transition-colors group-hover:text-indigo-500" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
