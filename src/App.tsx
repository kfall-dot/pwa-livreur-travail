import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DemoAutoplayBar } from './components/DemoAutoplayBar'
import { ToastViewport } from './components/ToastViewport'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { TourProvider } from './contexts/TourContext'
import { DashboardPage } from './pages/DashboardPage'
import { DeliveryPage } from './pages/DeliveryPage'
import { LoginPage } from './pages/LoginPage'
import { ManagerDashboardPage } from './pages/ManagerDashboardPage'
import { ManagerLoginPage } from './pages/ManagerLoginPage'
import { ManagerRegisterPage } from './pages/ManagerRegisterPage'
import { ManagerInvitePage } from './pages/ManagerInvitePage'
import { ManagerForgotPasswordPage } from './pages/ManagerForgotPasswordPage'
import { ManagerResetPasswordPage } from './pages/ManagerResetPasswordPage'
import { ManagerSecurityPage } from './pages/ManagerSecurityPage'
import { DemoShowcasePage } from './pages/DemoShowcasePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { MapPage } from './pages/MapPage'
import { ProfilePage } from './pages/ProfilePage'
import { processSyncQueue } from './lib/sync'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="page page-center" role="status">
        Chargement…
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  useEffect(() => {
    void processSyncQueue()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/demo/livreur" element={<DemoShowcasePage role="driver" />} />
      <Route path="/demo/manager" element={<DemoShowcasePage role="manager" />} />
      <Route
        element={
          <ProtectedRoute>
            <TourProvider>
              <Layout />
            </TourProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route
        path="/delivery/:id"
        element={
          <ProtectedRoute>
            <TourProvider>
              <DeliveryPage />
            </TourProvider>
          </ProtectedRoute>
        }
      />
      {/* Routes manager — paths explicites (évite /manager qui avale /manager/register) */}
      <Route path="/manager/login" element={<ManagerLoginPage />} />
      <Route path="/manager/register" element={<ManagerRegisterPage />} />
      <Route path="/manager/invite" element={<ManagerInvitePage />} />
      <Route path="/manager/forgot-password" element={<ManagerForgotPasswordPage />} />
      <Route path="/manager/reset-password" element={<ManagerResetPasswordPage />} />
      <Route path="/manager/security" element={<ManagerSecurityPage />} />
      <Route path="/manager" element={<ManagerDashboardPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <DemoAutoplayBar />
        <ToastViewport />
      </AuthProvider>
    </BrowserRouter>
  )
}
