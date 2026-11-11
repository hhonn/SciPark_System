import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { usePricingStore } from './stores/pricingStore'
import { authAPI } from './utils/apiService'

import Landing from './pages/Landing'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Home from './pages/Home'
import ParkingDetail from './pages/ParkingDetail'
import ActiveBooking from './pages/ActiveBooking'
import Privileges from './pages/Privileges'
import Profile from './pages/Profile'
import PaymentMethods from './pages/PaymentMethods'
import { PageLoader } from './components/ui/Loading'
import NotFound from './pages/NotFound'

import Layout from './components/layout/Layout'
import { canScan, isAdminUser } from './components/layout/navItems'

// Staff-only, and it carries the QR decoder: load it only when a staff
// member opens it, so drivers never download it.
const StaffScan = lazy(() => import('./pages/StaffScan'))
const Admin = lazy(() => import('./pages/Admin'))

/** Sends unauthenticated visitors to /login, remembering where they were going. */
function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
}

/** The QR scanner is for parking staff and admins only. The API enforces this
 *  too; this just keeps everyone else from landing on a screen that 403s. */
function StaffRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  return canScan(user) ? children : <Navigate to="/app" replace />
}

/** Operator screens. Again, the API is the real gate. */
function AdminRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  return isAdminUser(user) ? children : <Navigate to="/app" replace />
}

/** Keeps signed-in users out of the login/register screens. */
function PublicOnlyRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/app" replace /> : children
}

function App() {
  const hydratePricing = usePricingStore((s) => s.hydrate)

  // Fees are quoted on public pages too (landing, terms, privacy), so this runs
  // for every visitor, signed in or not.
  useEffect(() => {
    hydratePricing()
  }, [hydratePricing])

  // The remembered profile is only a hint; the httpOnly cookie is the session.
  // Confirm it once per load so a logged-out, expired or revoked session does
  // not keep showing the app. A 401 here is handled by the API interceptor.
  useEffect(() => {
    const { isAuthenticated, updateUser } = useAuthStore.getState()
    if (!isAuthenticated) return
    authAPI
      .me()
      .then(({ data }) => data?.user && updateUser(data.user))
      .catch(() => {})
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <Register />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPassword />
          </PublicOnlyRoute>
        }
      />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route
        path="/welcome"
        element={
          <ProtectedRoute>
            <Welcome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="parking/:id" element={<ParkingDetail />} />
        <Route path="booking" element={<ActiveBooking />} />
        <Route path="privileges" element={<Privileges />} />
        <Route path="profile" element={<Profile />} />
        <Route path="payment-methods" element={<PaymentMethods />} />
        <Route
          path="staff"
          element={
            <StaffRoute>
              <Suspense fallback={<PageLoader />}>
                <StaffScan />
              </Suspense>
            </StaffRoute>
          }
        />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Admin />
              </Suspense>
            </AdminRoute>
          }
        />
      </Route>

      {/* A real 404. The old catch-all silently redirected to "/", so a typo in
          the URL looked like the app had logged you out. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
