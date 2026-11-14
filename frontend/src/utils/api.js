import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

// Production builds are served by the backend itself, so the API is same-origin
// at /api. Only the Vite dev server (its own port) needs the absolute URL.
// Previously a production build without VITE_API_URL called localhost:3000
// (the visitor's own machine), and every request failed once deployed.
const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api')

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 20000,
})

// No Authorization header: the session is the httpOnly cookie, which
// `withCredentials` sends. Script never touches the token.

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''

    // A 401 on the auth endpoints themselves is just "wrong password". The old
    // interceptor logged the user out and hard-reloaded on those too, which
    // wiped the form they were typing in.
    const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register')

    if (status === 401 && !isAuthAttempt) {
      const { isAuthenticated, logout } = useAuthStore.getState()
      if (isAuthenticated) {
        logout()
        // Let the router handle it: window.location.href threw away the SPA
        // and reloaded the whole bundle.
        window.dispatchEvent(new CustomEvent('scipark:session-expired'))
      }
    }

    return Promise.reject(error)
  }
)

// Pull a human-readable message out of any axios failure.
export const apiErrorMessage = (error, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่') => {
  if (error?.code === 'ECONNABORTED') return 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่'
  if (!error?.response) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'
  return error.response.data?.message || fallback
}

export default api
