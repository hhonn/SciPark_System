import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mail, Lock, User, Phone, ArrowRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { authAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { cn } from '../utils/cn'
import { MIN_PASSWORD_LENGTH } from '../config/auth'

const Register = () => {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const reduce = useReducedMotion()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  const validate = () => {
    const next = {}

    if (!form.name.trim()) next.name = 'กรุณากรอกชื่อ-นามสกุล'

    if (!form.email.trim()) next.email = 'กรุณากรอกอีเมล'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'รูปแบบอีเมลไม่ถูกต้อง'

    if (form.phone && !/^[0-9]{10}$/.test(form.phone)) {
      next.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก'
    }

    // Checked here as well as on the server so the user finds out before the
    // round trip, not after.
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      next.password = `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
    }

    if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const { data } = await authAPI.register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      })

      login(data.user, data.token)
      toast.success('สมัครสมาชิกสำเร็จ')
      navigate('/welcome', { replace: true })
    } catch (error) {
      const message = apiErrorMessage(error, 'สมัครสมาชิกไม่สำเร็จ')
      // A 409 always concerns an identity field; point at it.
      if (error.response?.status === 409) setErrors({ email: message })
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const passwordStrong = form.password.length >= MIN_PASSWORD_LENGTH
  const passwordsMatch = form.password && form.password === form.confirmPassword

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
          <h1 className="text-h1 text-content">สมัครสมาชิก</h1>
          <p className="mt-1.5 text-small text-content-muted">ฟรี ไม่มีค่าใช้จ่ายรายเดือน</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              label="ชื่อ-นามสกุล"
              icon={User}
              autoComplete="name"
              placeholder="สมชาย ใจดี"
              value={form.name}
              onChange={update('name')}
              error={errors.name}
            />

            <Input
              label="อีเมล"
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
            />

            <Input
              label="เบอร์โทรศัพท์"
              icon={Phone}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0812345678"
              value={form.phone}
              onChange={update('phone')}
              error={errors.phone}
              hint="ไม่บังคับ ใช้สำหรับติดต่อกรณีฉุกเฉิน"
            />

            <div>
              <Input
                label="รหัสผ่าน"
                icon={Lock}
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.password}
                onChange={update('password')}
                error={errors.password}
              />
              {form.password && !errors.password && (
                <p
                  className={cn(
                    'mt-1.5 flex items-center gap-1.5 text-small',
                    passwordStrong ? 'text-ok' : 'text-content-subtle'
                  )}
                >
                  {passwordStrong && <Check className="w-3.5 h-3.5" />}
                  อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร
                </p>
              )}
            </div>

            <div>
              <Input
                label="ยืนยันรหัสผ่าน"
                icon={Lock}
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                error={errors.confirmPassword}
              />
              {passwordsMatch && !errors.confirmPassword && (
                <p className="mt-1.5 flex items-center gap-1.5 text-small text-ok">
                  <Check className="w-3.5 h-3.5" />
                  รหัสผ่านตรงกัน
                </p>
              )}
            </div>

            <Button type="submit" size="lg" fullWidth loading={loading} iconRight={ArrowRight}>
              สร้างบัญชี
            </Button>
          </form>

          <p className="mt-6 text-center text-small text-content-muted">
            มีบัญชีอยู่แล้ว?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-micro text-content-subtle">
          การสมัครถือว่ายอมรับ{' '}
          <Link to="/terms" className="underline hover:text-content-muted">
            ข้อกำหนด
          </Link>{' '}
          และ{' '}
          <Link to="/privacy" className="underline hover:text-content-muted">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default Register
