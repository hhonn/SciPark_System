import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mail, KeyRound, Lock, ArrowLeft, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { authAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { MIN_PASSWORD_LENGTH } from '../config/auth'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Two steps: ask for a code by email, then set a new password with it.
 * The server answers step one identically for registered and unknown
 * addresses, so this screen never says whether an account exists.
 */
const ForgotPassword = () => {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [form, setForm] = useState({ otp: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const requestCode = async (event) => {
    event?.preventDefault()
    if (!EMAIL.test(email.trim())) {
      setErrors({ email: 'กรุณากรอกอีเมลให้ถูกต้อง' })
      return
    }
    setLoading(true)
    try {
      const { data } = await authAPI.forgotPassword(email.trim().toLowerCase())
      toast.success(data.message, { duration: 6000 })
      setErrors({})
      setStep('reset')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'ส่งรหัสไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }

  const reset = async (event) => {
    event.preventDefault()
    const next = {}
    if (!/^\d{6}$/.test(form.otp)) next.otp = 'กรุณากรอกรหัส 6 หลักจากอีเมล'
    if (form.password.length < MIN_PASSWORD_LENGTH) next.password = `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
    if (form.password !== form.confirm) next.confirm = 'รหัสผ่านไม่ตรงกัน'
    setErrors(next)
    if (Object.keys(next).length) return

    setLoading(true)
    try {
      const { data } = await authAPI.resetPassword({
        email: email.trim().toLowerCase(),
        otp: form.otp,
        newPassword: form.password,
      })
      toast.success(data.message)
      navigate('/login', { replace: true })
    } catch (error) {
      const message = apiErrorMessage(error, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ')
      setErrors({ otp: message })
      if (error.response?.data?.code === 'otp_locked') setForm((f) => ({ ...f, otp: '' }))
    } finally {
      setLoading(false)
    }
  }

  const field = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
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
          <h1 className="text-h1 text-content">ลืมรหัสผ่าน</h1>

          {step === 'email' ? (
            <>
              <p className="mt-1.5 text-small text-content-muted">
                กรอกอีเมลที่ใช้สมัคร เราจะส่งรหัส 6 หลักไปให้
              </p>
              <form onSubmit={requestCode} className="mt-6 space-y-4" noValidate>
                <Input
                  label="อีเมล"
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setErrors({})
                  }}
                  error={errors.email}
                />
                <Button type="submit" size="lg" fullWidth loading={loading} iconRight={ArrowRight}>
                  ส่งรหัส
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-small text-content-muted">
                กรอกรหัสที่ส่งไปที่ <span className="font-medium text-content">{email}</span> แล้วตั้งรหัสผ่านใหม่
              </p>
              <form onSubmit={reset} className="mt-6 space-y-4" noValidate>
                <Input
                  label="รหัส 6 หลัก"
                  icon={KeyRound}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={form.otp}
                  onChange={(e) => field('otp')({ target: { value: e.target.value.replace(/\D/g, '') } })}
                  error={errors.otp}
                />
                <Input
                  label="รหัสผ่านใหม่"
                  icon={Lock}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={field('password')}
                  error={errors.password}
                />
                <Input
                  label="ยืนยันรหัสผ่านใหม่"
                  icon={Lock}
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={field('confirm')}
                  error={errors.confirm}
                />
                <Button type="submit" size="lg" fullWidth loading={loading}>
                  ตั้งรหัสผ่านใหม่
                </Button>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={loading}
                  className="w-full text-center text-small text-brand-600 hover:underline disabled:opacity-50"
                >
                  ไม่ได้รับรหัส? ส่งใหม่
                </button>
              </form>
            </>
          )}

          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-1.5 text-small text-content-muted hover:text-content"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

export default ForgotPassword
