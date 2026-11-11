import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, XCircle, LogOut, ShieldCheck, Users, Ticket, ScanLine, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Loading'
import { adminAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { formatDateTime, formatTHB } from '../utils/format'
import { cn } from '../utils/cn'

const BOOKING_FILTERS = [
  { id: 'active', label: 'ใช้งานอยู่' },
  { id: 'pending', label: 'รอเช็คอิน' },
  { id: 'confirmed', label: 'จอดอยู่' },
  { id: 'unpaid', label: 'ค้างชำระ' },
  { id: 'completed', label: 'เสร็จสิ้น' },
  { id: 'cancelled', label: 'ยกเลิก' },
]

const STATUS_BADGE = {
  pending: { tone: 'warn', label: 'รอเช็คอิน' },
  confirmed: { tone: 'brand', label: 'จอดอยู่' },
  completed: { tone: 'ok', label: 'เสร็จสิ้น' },
  cancelled: { tone: 'neutral', label: 'ยกเลิก' },
}

/** Re-run a search shortly after typing stops, not on every key. */
const useDebounced = (value, ms = 350) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

const Pager = ({ pagination, onPage }) =>
  pagination && pagination.pages > 1 ? (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
        ก่อนหน้า
      </Button>
      <span className="text-small text-content-muted tabular">
        {pagination.page} / {pagination.pages}
      </span>
      <Button variant="ghost" size="sm" iconRight={ChevronRight} disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>
        ถัดไป
      </Button>
    </div>
  ) : null

const BookingsTab = () => {
  const [filter, setFilter] = useState('active')
  const [query, setQuery] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const [data, setData] = useState({ bookings: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState(null) // { kind: 'cancel'|'checkout', booking }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const q = useDebounced(query)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await adminAPI.getBookings({ status: filter, q: q || undefined, page: pageNo })
      setData(res)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดรายการจองไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [filter, q, pageNo])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPageNo(1)
  }, [filter, q])

  const run = async () => {
    setBusy(true)
    try {
      const call = action.kind === 'cancel' ? adminAPI.cancelBooking : adminAPI.forceCheckout
      const { data: res } = await call(action.booking.id, note.trim())
      toast.success(res.message, { duration: 5000 })
      setAction(null)
      setNote('')
      load()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="สถานะการจอง">
        {BOOKING_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'h-9 px-3 rounded-full text-small border transition-colors duration-fast',
              filter === f.id
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-surface text-content-muted border-hairline hover:text-content'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Input
        label="ค้นหา"
        icon={Search}
        placeholder="ทะเบียนรถ อีเมล ชื่อ หรือเลขช่อง"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <div className="py-10 grid place-items-center"><Spinner /></div>
      ) : data.bookings.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-lg">
          <EmptyState icon={Ticket} title="ไม่มีรายการ" description="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />
        </div>
      ) : (
        <ul className="space-y-3">
          {data.bookings.map((b) => {
            const badge = STATUS_BADGE[b.status] || STATUS_BADGE.cancelled
            const owed = b.paymentStatus === 'failed'
            return (
              <li key={b.id} className="bg-surface border border-hairline rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-h3 text-content tabular">{b.vehicle?.licensePlate || 'ไม่ระบุทะเบียน'}</p>
                    <p className="text-small text-content-muted truncate">
                      {b.user?.name} · {b.user?.email}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge tone={badge.tone} dot>{badge.label}</Badge>
                    {owed && <Badge tone="risk">ค้าง {formatTHB(b.cost)}</Badge>}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small">
                  <dt className="text-content-subtle">ช่องจอด</dt>
                  <dd className="text-content text-right">{b.zoneName} · {b.spotNumber}</dd>
                  <dt className="text-content-subtle">จองเมื่อ</dt>
                  <dd className="text-content text-right">{formatDateTime(b.createdAt)}</dd>
                  {b.actualStartTime && (
                    <>
                      <dt className="text-content-subtle">เช็คอิน</dt>
                      <dd className="text-content text-right">
                        {formatDateTime(b.actualStartTime)}
                        {b.checkInMethod && ` (${b.checkInMethod === 'gps' ? 'GPS' : 'สแกน'})`}
                      </dd>
                    </>
                  )}
                  {b.adminNote && (
                    <>
                      <dt className="text-content-subtle">หมายเหตุ</dt>
                      <dd className="text-content text-right">{b.adminNote}</dd>
                    </>
                  )}
                </dl>

                {(b.status === 'pending' || b.status === 'confirmed') && (
                  <div className="flex flex-wrap gap-2 justify-end">
                    {b.status === 'confirmed' && (
                      <Button size="sm" variant="soft" icon={LogOut} onClick={() => setAction({ kind: 'checkout', booking: b })}>
                        เช็คเอาต์แทน
                      </Button>
                    )}
                    <Button size="sm" variant="danger-soft" icon={XCircle} onClick={() => setAction({ kind: 'cancel', booking: b })}>
                      ยกเลิกการจอง
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Pager pagination={data.pagination} onPage={setPageNo} />

      <Modal
        open={Boolean(action)}
        onClose={() => !busy && setAction(null)}
        title={action?.kind === 'cancel' ? 'ยกเลิกการจองนี้?' : 'เช็คเอาต์แทนผู้จอง?'}
        description={action && `${action.booking.vehicle?.licensePlate || ''} · ช่อง ${action.booking.spotNumber}`}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" fullWidth disabled={busy} onClick={() => setAction(null)}>
              ไม่ใช่
            </Button>
            <Button
              fullWidth
              variant={action?.kind === 'cancel' ? 'danger' : 'solid'}
              loading={busy}
              onClick={run}
            >
              {action?.kind === 'cancel' ? 'ยกเลิกการจอง' : 'เช็คเอาต์'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-small text-content-muted">
            {action?.kind === 'cancel'
              ? 'ช่องจอดจะว่างทันที ค่าธรรมเนียมการจองไม่คืน และผู้จองจะได้รับแจ้งเตือน'
              : 'ระบบจะคิดค่าจอดเกินเวลาตามปกติ ถ้าตัดเงินไม่สำเร็จ ช่องจอดจะยังถูกคืน และยอดจะถูกบันทึกเป็น "ค้างชำระ"'}
          </p>
          <Input
            label="หมายเหตุ (ผู้จองจะเห็น)"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น รถออกไปแล้วแต่ไม่ได้เช็คเอาต์"
          />
        </div>
      </Modal>
    </div>
  )
}

const UsersTab = () => {
  const [query, setQuery] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const [data, setData] = useState({ users: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const q = useDebounced(query)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await adminAPI.getUsers({ q: q || undefined, page: pageNo })
      setData(res)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดรายชื่อไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [q, pageNo])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPageNo(1)
  }, [q])

  const toggleStaff = async (user) => {
    setBusyId(user.id)
    try {
      const { data: res } = await adminAPI.setStaff(user.id, !user.isStaff)
      toast.success(res.message)
      setData((d) => ({ ...d, users: d.users.map((u) => (u.id === user.id ? { ...u, isStaff: res.user.isStaff } : u)) }))
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Input label="ค้นหาผู้ใช้" icon={Search} placeholder="อีเมลหรือชื่อ" value={query} onChange={(e) => setQuery(e.target.value)} />

      {loading ? (
        <div className="py-10 grid place-items-center"><Spinner /></div>
      ) : data.users.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-lg">
          <EmptyState icon={Users} title="ไม่พบผู้ใช้" />
        </div>
      ) : (
        <ul className="space-y-2">
          {data.users.map((u) => (
            <li key={u.id} className="bg-surface border border-hairline rounded-lg p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-content truncate">{u.name}</p>
                <p className="text-small text-content-muted truncate">{u.email}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone={u.rank === 'Iron' ? 'neutral' : 'brand'}>{u.rank}</Badge>
                  {u.isAdmin && <Badge tone="risk" icon={ShieldCheck}>แอดมิน</Badge>}
                  {u.isStaff && <Badge tone="ok" icon={ScanLine}>เจ้าหน้าที่</Badge>}
                  {!u.isAccountVerified && <Badge tone="warn">ยังไม่ยืนยันอีเมล</Badge>}
                </div>
              </div>
              <Button
                size="sm"
                variant={u.isStaff ? 'outline' : 'soft'}
                loading={busyId === u.id}
                onClick={() => toggleStaff(u)}
                className="shrink-0"
              >
                {u.isStaff ? 'ถอนเจ้าหน้าที่' : 'ตั้งเป็นเจ้าหน้าที่'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Pager pagination={data.pagination} onPage={setPageNo} />
      <p className="text-micro text-content-subtle">
        สิทธิ์แอดมินให้ได้จากเซิร์ฟเวอร์เท่านั้น เพื่อไม่ให้เซสชันแอดมินที่ถูกขโมยสร้างแอดมินเพิ่มได้
      </p>
    </div>
  )
}

const TABS = [
  { id: 'bookings', label: 'การจอง', icon: Ticket },
  { id: 'users', label: 'ผู้ใช้', icon: Users },
]

const Admin = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState('bookings')

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-content">ผู้ดูแลระบบ</h1>
          <p className="mt-1 text-small text-content-muted">จัดการการจองที่ค้าง และสิทธิ์เจ้าหน้าที่</p>
        </div>
        <Button variant="outline" icon={ScanLine} className="shrink-0" onClick={() => navigate('/app/staff')}>
          สแกน / พิกัดลาน
        </Button>
      </header>

      <div className="flex gap-1 p-1 rounded-md bg-surface-2 w-fit" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'h-9 px-4 rounded-sm inline-flex items-center gap-2 text-small font-medium transition-colors duration-fast',
              tab === id ? 'bg-surface text-content shadow-e1' : 'text-content-muted hover:text-content'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'bookings' ? <BookingsTab /> : <UsersTab />}
    </div>
  )
}

export default Admin
