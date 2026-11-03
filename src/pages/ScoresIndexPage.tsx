import { BookOpen, Plus } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useClassrooms, useStudents, useSubjects } from '@/hooks/queries'
import { termLongLabel } from '@/lib/utils'
import { ClassCards } from '@/components/ClassCards'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/Misc'

export default function ScoresIndexPage() {
  const { term } = useApp()
  const subjectsQ = useSubjects(term.id)
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useStudents(term.id)
  if (subjectsQ.isPending || classroomsQ.isPending || studentsQ.isPending) return <PageLoader />
  const subjects = subjectsQ.data ?? []
  return (
    <>
      <PageHeader title="กรอกคะแนน" subtitle={`เลือกรายวิชาและห้อง · ${termLongLabel(term)}`} />
      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="ยังไม่มีรายวิชาในภาคเรียนนี้"
          description="เพิ่มรายวิชาและเลือกห้องที่สอนก่อน แล้วกลับมากรอกคะแนน"
          action={
            <ButtonLink to="/subjects" variant="primary" icon={<Plus className="size-4" />}>
              เพิ่มรายวิชา
            </ButtonLink>
          }
        />
      ) : (
        <ClassCards subjects={subjects} classrooms={classroomsQ.data ?? []} students={studentsQ.data ?? []} />
      )}
    </>
  )
}
