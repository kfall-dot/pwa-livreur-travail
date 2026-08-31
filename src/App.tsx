import { Component, useEffect } from 'react'
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

/** Affiche l'erreur à l'écran au lieu d'une page blanche (debug prod). */
class VisibleErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[traceo:boundary]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }} data-testid="app-error-boundary">
          <h2>⚠️ Une erreur inattendue est survenue</h2>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>Recharger la page</button>
        </div>
      )
    }
    return this.props.children
  }
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
      <VisibleErrorBoundary>
        <AuthProvider>
          <AppRoutes />
          <DemoAutoplayBar />
          <ToastViewport />
        </AuthProvider>
      </VisibleErrorBoundary>
    </BrowserRouter>
  )
}
