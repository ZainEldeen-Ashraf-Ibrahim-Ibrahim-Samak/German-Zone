import * as React from 'react'
import { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './i18n/index.js'
import { useAuthStore } from './store/useAuthStore.js'
import { LoadingSpinner } from './components/ui/LoadingSpinner.js'
import { Sidebar } from './components/layout/Sidebar.js'
import { Header } from './components/layout/Header.js'
import { RoleGuard } from './components/layout/RoleGuard.js'
import { UpdateBanner } from './components/layout/UpdateBanner.js'
import { SyncBanner } from './components/layout/SyncBanner.js'
import { useBranding } from './hooks/useBranding.js'

// Import Pages
import Dashboard from './pages/Dashboard.js'
import Login from './pages/Login.js'
import ChildrenList from './pages/Children/ChildrenList.js'
import ChildForm from './pages/Children/ChildForm.js'
import ChildStatement from './pages/Children/ChildStatement.js'
import ChildDetails from './pages/Children/ChildDetails.js'
import MonthlyPayments from './pages/Payments/MonthlyPayments.js'
import SalariesList from './pages/Salaries/SalariesList.js'
import PayrollReport from './pages/Salaries/PayrollReport.js'
import Transactions from './pages/Transactions/Transactions.js'
import CalendarPage from './pages/Calendar/Calendar.js'
import EmployeesList from './pages/Employees/EmployeesList.js'
import ExpensesList from './pages/Expenses/ExpensesList.js'
import TargetPlanning from './pages/Target/TargetPlanning.js'
import StorageManager from './pages/Storage/StorageManager.js'
import SyncManager from './pages/Sync/SyncManager.js'
import Settings from './pages/Settings/Settings.js'
import UsersList from './pages/Users/UsersList.js'
import SessionsList from './pages/Sessions/SessionsList.js'
import EditRequestsInbox from './pages/Attendance/EditRequestsInbox.js'

// Layout component wrapping protected routes
const AppLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading && !isAuthenticated) {
    return <LoadingSpinner fullPage size="lg" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <UpdateBanner />
        <SyncBanner />
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { checkCurrent, isLoading, isAuthenticated } = useAuthStore()
  useBranding()

  // Verify session on app startup
  useEffect(() => {
    checkCurrent()
  }, [checkCurrent])

  if (isLoading && !isAuthenticated) {
    return <LoadingSpinner fullPage size="lg" />
  }

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />

        {/* Protected Routes */}
        <Route path="/" element={<AppLayout />}>
          {/* Dashboard - Both admin and employee */}
          <Route index element={<Dashboard />} />

          {/* Children Roster - all read & add (feature 004 FR-012); edit is admin-only */}
          <Route path="children" element={<ChildrenList />} />
          <Route path="children/new" element={<RoleGuard allowedRoles={['admin', 'employee']}><ChildForm /></RoleGuard>} />
          <Route path="children/:id/edit" element={<RoleGuard allowedRoles={['admin']}><ChildForm /></RoleGuard>} />
          <Route path="children/:id/statement" element={<ChildStatement />} />
          <Route path="children/:id/details" element={<ChildDetails />} />

          {/* Payments - Both read/write */}
          <Route path="payments" element={<MonthlyPayments />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="calendar" element={<CalendarPage />} />

          {/* Employees - Admin only */}
          <Route
            path="employees"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <EmployeesList />
              </RoleGuard>
            }
          />

          {/* Salaries - Admin only */}
          <Route
            path="salaries"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <SalariesList />
              </RoleGuard>
            }
          />
          <Route
            path="salaries/payroll-report"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <PayrollReport />
              </RoleGuard>
            }
          />

          {/* Expenses - Admin only for writes (guarded internally) */}
          <Route
            path="expenses"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <ExpensesList />
              </RoleGuard>
            }
          />

          {/* Target Planning - Admin only */}
          <Route
            path="target"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <TargetPlanning />
              </RoleGuard>
            }
          />

          {/* Users Accounts - Admin only */}
          <Route
            path="users"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <UsersList />
              </RoleGuard>
            }
          />
          <Route path="users/list" element={<Navigate to="/users" replace />} />

          {/* Settings - Admin only */}
          <Route
            path="settings"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <Settings />
              </RoleGuard>
            }
          />

          {/* Storage Database - Admin only */}
          <Route
            path="storage"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <StorageManager />
              </RoleGuard>
            }
          />

          {/* Cloud Sync - all roles (auto-sync runs for everyone; config stays admin-only in IPC) */}
          <Route
            path="sync"
            element={
              <RoleGuard allowedRoles={['admin', 'employee']}>
                <SyncManager />
              </RoleGuard>
            }
          />

          {/* Sessions & Attendance - admin and employee */}
          <Route path="sessions" element={<SessionsList />} />

          {/* Attendance Edit Requests inbox - admin only (feature 007) */}
          <Route
            path="attendance/edit-requests"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <EditRequestsInbox />
              </RoleGuard>
            }
          />

          {/* Fallback to Dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  )
}
