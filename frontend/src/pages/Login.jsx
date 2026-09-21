import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { authAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const reduce = useReducedMotion()

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    // Clear the field error as soon as the user starts correcting it.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  const validate = () => {
    const next = {}
    if (!form.email.trim()) next.email = 'กรุณากรอกอีเมลหรือชื่อผู้ใช้'
    if (!form.password) next.password = 'กรุณากรอกรหัสผ่าน'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const { data } = await authAPI.login({
        email: form.email.trim(),
        password: form.password,
      })

      login(data.user, data.token)
      toast.success(`ยินดีต้อนรับ ${data.user?.name || ''}`)

      // Return the user to whatever they were trying to reach.
      navigate(location.state?.from || '/app', { replace: true })
    } catch (error) {
      const message = apiErrorMessage(error, 'เข้าสู่ระบบไม่สำเร็จ')
      setErrors({ password: message })
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-canvas">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 0.8, 0.29, 1] }}
        className="w-full max-w-sm"
      >
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <Logo className="w-10 h-10" />
          <span className="text-h2 font-semibold tracking-tight">SciPark</span>
        </Link>

        <div className="bg-surface border border-hairline rounded-xl shadow-e2 p-6 sm:p-7">
          <h1 className="text-h1 text-content">เข้าสู่ระบบ</h1>
          <p className="mt-1.5 text-small text-content-muted">
            จองที่จอดรถในคณะได้ในไม่กี่คลิก
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              label="อีเมลหรือชื่อผู้ใช้"
              icon={Mail}
              type="text"
              autoComplete="username"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
            />

            <Input
              label="รหัสผ่าน"
              icon={Lock}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={update('password')}
              error={errors.password}
            />

            <Button type="submit" size="lg" fullWidth loading={loading} iconRight={ArrowRight}>
              เข้าสู่ระบบ
            </Button>
          </form>

          <p className="mt-6 text-center text-small text-content-muted">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              สมัครสมาชิกฟรี
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-micro text-content-subtle">
          การเข้าสู่ระบบถือว่ายอมรับ{' '}
          <Link to="/terms" className="underline hover:text-content-muted">
            ข้อกำหนดการใช้งาน
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default Login
