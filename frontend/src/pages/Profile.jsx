import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  User,
  Car,
  History,
  Lock,
  Plus,
  Trash2,
  Star,
  CreditCard,
  Inbox,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Loading'
import { userAPI, vehicleAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { formatDateTime, formatTHB } from '../utils/format'
import { MIN_PASSWORD_LENGTH } from '../config/auth'
import { cn } from '../utils/cn'

const TABS = [
  { id: 'profile', label: 'ข้อมูลส่วนตัว', icon: User },
  { id: 'vehicles', label: 'ยานพาหนะ', icon: Car },
  { id: 'history', label: 'ประวัติการจอง', icon: History },
  { id: 'security', label: 'ความปลอดภัย', icon: Lock },
]

const STATUS_META = {
  completed: { tone: 'ok', label: 'เสร็จสิ้น' },
  cancelled: { tone: 'risk', label: 'ยกเลิก' },
  confirmed: { tone: 'brand', label: 'กำลังจอด' },
  pending: { tone: 'warn', label: 'รอเช็คอิน' },
}

const Profile = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const updateUser = useAuthStore((s) => s.updateUser)

  // Tab lives in the URL, so the sidebar deep links (?tab=vehicles) work and
  // the browser back button behaves.
  const activeTab = TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'profile'
  const setTab = (tab) => setSearchParams(tab === 'profile' ? {} : { tab })

  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ name: '', phone: '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [vehicleModal, setVehicleModal] = useState(false)
  const [vehicleForm, setVehicleForm] = useState({
    licensePlate: '',
    brand: '',
    model: '',
    color: '',
  })
  const [errors, setErrors] = useState({})

  const load = useCallback(async () => {
    try {
      const [profileRes, vehicleRes, historyRes] = await Promise.allSettled([
        userAPI.getProfile(),
        vehicleAPI.getAll(),
        userAPI.getBookingHistory({ limit: 20 }),
      ])

      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value.data.user)
        setStats(profileRes.value.data.stats)
        setForm({
          name: profileRes.value.data.user.name || '',
          phone: profileRes.value.data.user.phone || '',
        })
      }
      if (vehicleRes.status === 'fulfilled') setVehicles(vehicleRes.value.data.data || [])
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data.bookings || [])
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveProfile = async (event) => {
    event.preventDefault()
    setErrors({})

    if (!form.name.trim()) {
      setErrors({ name: 'กรุณากรอกชื่อ-นามสกุล' })
      return
    }

    // The phone number is optional at registration, so requiring one here left
    // anyone who signed up without one unable to edit their own name.
    if (form.phone.trim() && !/^[0-9]{10}$/.test(form.phone.trim())) {
      setErrors({ phone: 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก' })
      return
    }

    setSaving(true)
    try {
      const { data } = await userAPI.updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
      })
      updateUser(data.user)
      setProfile((prev) => ({ ...prev, ...data.user }))
      toast.success('บันทึกข้อมูลแล้ว')
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const savePassword = async (event) => {
    event.preventDefault()
    setErrors({})

    if (passwords.newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrors({
        newPassword: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
      })
      return
    }
    if (passwords.newPassword !== passwords.confirm) {
      setErrors({ confirm: 'รหัสผ่านไม่ตรงกัน' })
      return
    }

    setSaving(true)
    try {
      await userAPI.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      })
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('เปลี่ยนรหัสผ่านแล้ว')
    } catch (error) {
      setErrors({ currentPassword: apiErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const addVehicle = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await vehicleAPI.create(vehicleForm)
      setVehicleModal(false)
      setVehicleForm({ licensePlate: '', brand: '', model: '', color: '' })
      toast.success('เพิ่มยานพาหนะแล้ว')
      const { data } = await vehicleAPI.getAll()
      setVehicles(data.data || [])
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const removeVehicle = async (id) => {
    const snapshot = vehicles
    setVehicles((prev) => prev.filter((v) => v.id !== id))
    try {
      await vehicleAPI.delete(id)
      toast.success('ลบยานพาหนะแล้ว')
    } catch (error) {
      setVehicles(snapshot)
      toast.error(apiErrorMessage(error))
    }
  }

  const makeDefault = async (id) => {
    try {
      await vehicleAPI.setDefault(id)
      setVehicles((prev) => prev.map((v) => ({ ...v, isDefault: v.id === id })))
      toast.success('ตั้งเป็นรถหลักแล้ว')
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  if (loading) return <PageLoader label="กำลังโหลดโปรไฟล์..." />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Identity header */}
      <header className="bg-surface border border-hairline rounded-lg p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="w-14 h-14 rounded-full bg-brand-500/12 text-brand-600 flex items-center justify-center text-h1 font-semibold shrink-0">
            {profile?.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-h1 text-content truncate">{profile?.name}</h1>
            <p className="text-small text-content-muted truncate">{profile?.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={profile?.rank === 'Iron' ? 'neutral' : 'brand'} dot>
                {profile?.rank}
              </Badge>
              <span className="font-mono text-small text-content-muted tabular">
                {profile?.points ?? 0} แต้ม
              </span>
            </div>
          </div>
        </div>

        {stats && (
          <dl className="mt-5 grid grid-cols-3 gap-3">
            {[
              ['การจองทั้งหมด', stats.totalBookings],
              ['จ่ายไปแล้ว', formatTHB(stats.totalSpent)],
              ['ประหยัดได้', formatTHB(stats.totalSavings)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface-2 p-3 text-center">
                <dt className="text-micro text-content-subtle">{label}</dt>
                <dd className="mt-0.5 font-mono text-h3 text-content tabular">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        className="flex gap-1 p-1 bg-surface-2 rounded-md overflow-x-auto"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              'flex items-center gap-2 h-10 px-3.5 rounded-sm text-small font-medium whitespace-nowrap',
              'transition-colors duration-fast',
              activeTab === tab.id
                ? 'bg-surface text-content shadow-e1'
                : 'text-content-muted hover:text-content'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---- Profile ---- */}
      {activeTab === 'profile' && (
        <form onSubmit={saveProfile} className="bg-surface border border-hairline rounded-lg p-5 sm:p-6 space-y-4">
          <Input
            label="ชื่อ-นามสกุล"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          <Input
            label="เบอร์โทรศัพท์"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            error={errors.phone}
            hint="ไม่บังคับ ใช้สำหรับติดต่อกรณีฉุกเฉิน"
          />
          <Input label="อีเมล" value={profile?.email || ''} disabled hint="ไม่สามารถเปลี่ยนอีเมลได้" />

          <div className="pt-2">
            <Button type="submit" loading={saving}>
              บันทึกการเปลี่ยนแปลง
            </Button>
          </div>
        </form>
      )}

      {/* ---- Vehicles ---- */}
      {activeTab === 'vehicles' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button icon={Plus} onClick={() => setVehicleModal(true)}>
              เพิ่มยานพาหนะ
            </Button>
          </div>

          {vehicles.length === 0 ? (
            <div className="bg-surface border border-hairline rounded-lg">
              <EmptyState
                icon={Car}
                title="ยังไม่มียานพาหนะ"
                description="เพิ่มข้อมูลรถเพื่อใช้ยืนยันตัวตนตอนเข้าจอด"
                action={
                  <Button icon={Plus} onClick={() => setVehicleModal(true)}>
                    เพิ่มยานพาหนะ
                  </Button>
                }
              />
            </div>
          ) : (
            vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="bg-surface border border-hairline rounded-lg p-4 flex items-center gap-4"
              >
                <span className="w-11 h-11 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5 text-content-muted" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-mono text-h3 text-content">{vehicle.licensePlate}</p>
                  <p className="text-small text-content-muted truncate">
                    {vehicle.brand} {vehicle.model}
                    {vehicle.color ? ` · ${vehicle.color}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {vehicle.isDefault ? (
                    <Badge tone="brand" icon={Star}>
                      รถหลัก
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => makeDefault(vehicle.id)}
                      aria-label="ตั้งเป็นรถหลัก"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVehicle(vehicle.id)}
                    aria-label={`ลบ ${vehicle.licensePlate}`}
                    className="text-risk hover:text-risk"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}

          <Link to="/app/payment-methods" className="block">
            <div className="bg-surface border border-hairline rounded-lg p-4 flex items-center gap-4 hover:border-brand-500/40 transition-colors duration-fast">
              <span className="w-11 h-11 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-content-muted" />
              </span>
              <div className="flex-1">
                <p className="text-small font-medium text-content">วิธีการชำระเงิน</p>
                <p className="text-small text-content-muted">จัดการบัตรและพร้อมเพย์</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ---- History ---- */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="bg-surface border border-hairline rounded-lg">
              <EmptyState
                icon={Inbox}
                title="ยังไม่มีประวัติการจอง"
                description="เมื่อคุณจองที่จอด ประวัติจะแสดงที่นี่"
                action={
                  <Link to="/app">
                    <Button>จองที่จอด</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            history.map((booking) => {
              const meta = STATUS_META[booking.status] || STATUS_META.pending
              return (
                <div key={booking.id} className="bg-surface border border-hairline rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-h3 text-content">{booking.spotNumber}</p>
                      <p className="text-small text-content-muted truncate">{booking.zoneName}</p>
                    </div>
                    <Badge tone={meta.tone} dot>
                      {meta.label}
                    </Badge>
                  </div>

                  <div className="mt-3 pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-small">
                    <span className="text-content-muted">
                      {formatDateTime(booking.startTime)}
                    </span>
                    <span className="font-mono font-semibold text-content tabular">
                      {formatTHB(booking.totalCost)}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ---- Security ---- */}
      {activeTab === 'security' && (
        <form onSubmit={savePassword} className="bg-surface border border-hairline rounded-lg p-5 sm:p-6 space-y-4">
          <Input
            label="รหัสผ่านปัจจุบัน"
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
            error={errors.currentPassword}
          />
          <Input
            label="รหัสผ่านใหม่"
            type="password"
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            error={errors.newPassword}
            hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
          />
          <Input
            label="ยืนยันรหัสผ่านใหม่"
            type="password"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            error={errors.confirm}
          />

          <div className="pt-2">
            <Button type="submit" loading={saving}>
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </form>
      )}

      {/* ---- Add vehicle ---- */}
      <Modal
        open={vehicleModal}
        onClose={() => setVehicleModal(false)}
        title="เพิ่มยานพาหนะ"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setVehicleModal(false)}>
              ยกเลิก
            </Button>
            {/* The fields live in a <form> below; submitting through it is
                what makes Enter work from any of them. */}
            <Button type="submit" form="add-vehicle-form" fullWidth loading={saving}>
              บันทึก
            </Button>
          </div>
        }
      >
        <form id="add-vehicle-form" onSubmit={addVehicle} className="space-y-4">
          <Input
            label="ป้ายทะเบียน"
            placeholder="กข 1234 กรุงเทพมหานคร"
            value={vehicleForm.licensePlate}
            onChange={(e) => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value })}
            data-autofocus
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="ยี่ห้อ"
              placeholder="Toyota"
              value={vehicleForm.brand}
              onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
            />
            <Input
              label="รุ่น"
              placeholder="Yaris"
              value={vehicleForm.model}
              onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
            />
          </div>
          <Input
            label="สี"
            placeholder="ขาว"
            value={vehicleForm.color}
            onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
          />
        </form>
      </Modal>
    </div>
  )
}

export default Profile
