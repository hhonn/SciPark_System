import { useState } from 'react'
import { MailCheck, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from './ui/Button'
import Input from './ui/Input'
import { authAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'

// Email verification by 6-digit code. The API for this has existed all along;
// nothing in the app ever called it, so no account could become verified.
const VerifyEmailCard = ({ email, onVerified }) => {
  const updateUser = useAuthStore((s) => s.updateUser)
  const required = useAuthStore((s) => Boolean(s.user?.emailVerificationRequired))
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      const { data } = await authAPI.sendVerifyOTP()
      toast.success(data.message)
      setSent(true)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'ส่งรหัสไม่สำเร็จ'))
      // A cooldown still means a code is on its way.
      if (err.response?.data?.code === 'otp_cooldown') setSent(true)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError('กรุณากรอกรหัส 6 หลัก')
      return
    }
    setBusy(true)
    try {
      const { data } = await authAPI.verifyAccount(code)
      toast.success(data.message)
      updateUser({ isAccountVerified: true })
      onVerified?.()
    } catch (err) {
      setError(apiErrorMessage(err, 'ยืนยันไม่สำเร็จ'))
      if (err.response?.data?.code === 'otp_locked') {
        setSent(false)
        setCode('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-warn/30 bg-warn/6 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <MailCheck className="w-5 h-5 mt-0.5 text-warn shrink-0" />
        <div className="min-w-0">
          <p className="text-body font-medium text-content">ยืนยันอีเมลของคุณ</p>
          <p className="text-small text-content-muted">
            เราจะส่งรหัส 6 หลักไปที่ <span className="font-medium text-content break-all">{email}</span>
            {required ? ' ต้องยืนยันก่อนจึงจะจองที่จอดได้' : ' เพื่อใช้กู้คืนบัญชีหากลืมรหัสผ่าน'}
          </p>
        </div>
      </div>

      {sent ? (
        <form onSubmit={verify} className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="รหัส 6 หลัก"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''))
                setError(null)
              }}
              error={error}
            />
          </div>
          <Button type="submit" loading={busy}>ยืนยัน</Button>
        </form>
      ) : (
        <Button variant="soft" icon={Send} onClick={send} loading={busy}>
          ส่งรหัสยืนยัน
        </Button>
      )}

      {sent && (
        <button type="button" onClick={send} disabled={busy} className="text-small text-brand-600 hover:underline disabled:opacity-50">
          ส่งรหัสใหม่
        </button>
      )}
    </div>
  )
}

export default VerifyEmailCard
