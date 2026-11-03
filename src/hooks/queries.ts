import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'
import type { Settings, Student, Submission, SubmissionInput, UUID } from '@/lib/api/types'
import { subKey } from '@/lib/gradebook'
import { compareClassrooms, compareStudents, errorMessage, thaiCollator } from '@/lib/utils'

export const qk = {
  settings: ['settings'] as const,
  terms: ['terms'] as const,
  classrooms: (termId?: UUID) => ['classrooms', termId] as const,
  students: (termId?: UUID) => ['students', termId] as const,
  subjects: (termId?: UUID) => ['subjects', termId] as const,
  assignments: (subjectId?: UUID) => ['assignments', subjectId] as const,
  dueDates: (subjectId?: UUID) => ['dueDates', subjectId] as const,
  submissions: (subjectId?: UUID, classroomId?: UUID) => ['submissions', subjectId, classroomId] as const,
  groups: (subjectId?: UUID) => ['groups', subjectId] as const,
  termAssignments: (termId?: UUID) => ['termAssignments', termId] as const,
}

const api = () => getApi()

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => api().getSettings() })
}

export function useTerms() {
  return useQuery({ queryKey: qk.terms, queryFn: () => api().listTerms() })
}

export function useClassrooms(termId?: UUID) {
  return useQuery({
    queryKey: qk.classrooms(termId),
    queryFn: () => api().listClassrooms(termId!),
    enabled: !!termId,
    select: (rows) => [...rows].sort(compareClassrooms),
  })
}

export function useStudents(termId?: UUID) {
  return useQuery({
    queryKey: qk.students(termId),
    queryFn: () => api().listStudents(termId!),
    enabled: !!termId,
    select: (rows) => [...rows].sort(compareStudents),
  })
}

export function useSubjects(termId?: UUID) {
  return useQuery({
    queryKey: qk.subjects(termId),
    queryFn: () => api().listSubjects(termId!),
    enabled: !!termId,
    select: (rows) =>
      [...rows].sort((a, b) => thaiCollator.compare(a.code, b.code) || thaiCollator.compare(a.name, b.name)),
  })
}

export function useAssignments(subjectId?: UUID) {
  return useQuery({
    queryKey: qk.assignments(subjectId),
    queryFn: () => api().listAssignments(subjectId!),
    enabled: !!subjectId,
  })
}

export function useGroups(subjectId?: UUID) {
  return useQuery({
    queryKey: qk.groups(subjectId),
    queryFn: () => api().listGroups(subjectId!),
    enabled: !!subjectId,
  })
}

export function useTermAssignments(termId?: UUID) {
  return useQuery({
    queryKey: qk.termAssignments(termId),
    queryFn: () => api().listTermAssignments(termId!),
    enabled: !!termId,
  })
}

export function useDueDates(subjectId?: UUID) {
  return useQuery({
    queryKey: qk.dueDates(subjectId),
    queryFn: () => api().listDueDates(subjectId!),
    enabled: !!subjectId,
  })
}

/** นักเรียนในห้อง เรียงตามเลขที่ */
export function useRoomStudents(termId?: UUID, classroomId?: UUID) {
  const q = useStudents(termId)
  const data = useMemo(
    () => (q.data ?? []).filter((s) => s.classroom_id === classroomId).sort(compareStudents),
    [q.data, classroomId],
  )
  return { ...q, data }
}

export function useRoomSubmissions(subjectId: UUID | undefined, classroomId: UUID | undefined, students: Student[], ready: boolean) {
  return useQuery({
    queryKey: qk.submissions(subjectId, classroomId),
    queryFn: () =>
      api().listSubmissions(
        subjectId!,
        students.map((s) => s.id),
      ),
    enabled: !!subjectId && !!classroomId && ready,
  })
}

/** mutation ทั่วไป: เรียก API → แจ้งผล → refresh ข้อมูลที่เกี่ยวข้อง */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { invalidate?: (vars: TVars) => QueryKey[]; success?: string | ((r: TResult, v: TVars) => string) } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      if (opts.invalidate) await Promise.all(opts.invalidate(vars).map((queryKey) => qc.invalidateQueries({ queryKey })))
      if (opts.success) toast.success(typeof opts.success === 'string' ? opts.success : opts.success(result, vars))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api().updateSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.settings })
      const prev = qc.getQueryData<Settings>(qk.settings)
      if (prev) qc.setQueryData<Settings>(qk.settings, { ...prev, ...patch })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.settings, ctx.prev)
      toast.error(errorMessage(e))
    },
  })
}

function mergeSubmissions(old: Submission[], incoming: Submission[]): Submission[] {
  const map = new Map(old.map((s) => [subKey(s.assignment_id, s.student_id), s]))
  for (const s of incoming) map.set(subKey(s.assignment_id, s.student_id), s)
  return [...map.values()]
}

/** บันทึกคะแนนแบบ optimistic: หน้าจออัปเดตทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์ */
export function useSaveSubmissions(subjectId?: UUID, classroomId?: UUID) {
  const qc = useQueryClient()
  const key = qk.submissions(subjectId, classroomId)
  return useMutation({
    mutationFn: (rows: SubmissionInput[]) => api().saveSubmissions(rows),
    onMutate: async (rows) => {
      await qc.cancelQueries({ queryKey: key })
      qc.setQueryData<Submission[]>(key, (old = []) => {
        const existing = new Map(old.map((s) => [subKey(s.assignment_id, s.student_id), s.id]))
        return mergeSubmissions(
          old,
          rows.map((r) => ({ id: existing.get(subKey(r.assignment_id, r.student_id)) ?? `tmp-${subKey(r.assignment_id, r.student_id)}`, ...r })),
        )
      })
    },
    onSuccess: (saved) => {
      qc.setQueryData<Submission[]>(key, (old = []) => mergeSubmissions(old, saved))
    },
    onError: (e) => {
      toast.error(`บันทึกไม่สำเร็จ: ${errorMessage(e)}`)
      qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useDeleteSubmissions(subjectId?: UUID, classroomId?: UUID) {
  const qc = useQueryClient()
  const key = qk.submissions(subjectId, classroomId)
  return useMutation({
    mutationFn: ({ assignmentId, studentIds }: { assignmentId: UUID; studentIds: UUID[] }) =>
      api().deleteSubmissions(assignmentId, studentIds),
    onMutate: async ({ assignmentId, studentIds }) => {
      await qc.cancelQueries({ queryKey: key })
      const ids = new Set(studentIds)
      qc.setQueryData<Submission[]>(key, (old = []) =>
        old.filter((s) => !(s.assignment_id === assignmentId && ids.has(s.student_id))),
      )
    },
    onError: (e) => {
      toast.error(`ลบไม่สำเร็จ: ${errorMessage(e)}`)
      qc.invalidateQueries({ queryKey: key })
    },
  })
}
