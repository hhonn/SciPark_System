import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { usePricingStore } from './stores/pricingStore'

import Landing from './pages/Landing'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Register from './pages/Register'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Home from './pages/Home'
import ParkingDetail from './pages/ParkingDetail'
import ActiveBooking from './pages/ActiveBooking'
import Privileges from './pages/Privileges'
import Profile from './pages/Profile'
import PaymentMethods from './pages/PaymentMethods'
import NotFound from './pages/NotFound'

import Layout from './components/layout/Layout'

/** Sends unauthenticated visitors to /login, remembering where they were going. */
function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
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
      </Route>

      {/* A real 404. The old catch-all silently redirected to "/", so a typo in
          the URL looked like the app had logged you out. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
