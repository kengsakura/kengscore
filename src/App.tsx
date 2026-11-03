import { lazy, Suspense } from 'react'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router'
import { ARTIFACT } from '@/lib/env'
import { hasSupabase, isDemoMode } from '@/lib/api'
import { AuthGate } from '@/context/AuthContext'
import { AppProvider } from '@/context/AppContext'
import { ConfirmProvider } from '@/components/ui/Modal'
import { FullScreenLoader, PageLoader } from '@/components/ui/Feedback'
import AppShell from '@/components/layout/AppShell'
import DashboardPage from '@/pages/DashboardPage'
import SetupPage from '@/pages/SetupPage'

const ScoresIndexPage = lazy(() => import('@/pages/ScoresIndexPage'))
const RoomPage = lazy(() => import('@/pages/RoomPage'))
const EntryPage = lazy(() => import('@/pages/EntryPage'))
const SummaryPage = lazy(() => import('@/pages/SummaryPage'))
const FollowUpPage = lazy(() => import('@/pages/FollowUpPage'))
const StudentsPage = lazy(() => import('@/pages/StudentsPage'))
const SlipsPage = lazy(() => import('@/pages/SlipsPage'))
const SubjectsPage = lazy(() => import('@/pages/SubjectsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const StudentPortalPage = lazy(() => import('@/pages/StudentPortalPage'))

const Router = ARTIFACT ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <Routes>
        {/* หน้าของนักเรียน: ไม่ต้องเข้าสู่ระบบ */}
        <Route
          path="/s/:code?"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <StudentPortalPage />
            </Suspense>
          }
        />
        <Route path="*" element={<TeacherApp />} />
      </Routes>
    </Router>
  )
}

function TeacherApp() {
  if (!hasSupabase && !isDemoMode()) return <SetupPage />
  return (
    <ConfirmProvider>
      <AuthGate>
        <AppProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="scores" element={<ScoresIndexPage />} />
                <Route path="scores/:subjectId/:classroomId" element={<RoomPage />} />
                <Route path="scores/:subjectId/:classroomId/:assignmentId" element={<EntryPage />} />
                <Route path="summary" element={<SummaryPage />} />
                <Route path="followup" element={<FollowUpPage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/slips" element={<SlipsPage />} />
                <Route path="subjects" element={<SubjectsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </AppProvider>
      </AuthGate>
    </ConfirmProvider>
  )
}
