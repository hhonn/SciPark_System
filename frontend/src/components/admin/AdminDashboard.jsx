import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock3, RefreshCw, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../ui/Button'
import { Spinner } from '../ui/Loading'
import { adminAPI } from '../../utils/apiService'
import { apiErrorMessage } from '../../utils/api'
import { formatDateTime, formatTHB, formatTime } from '../../utils/format'
import { cn } from '../../utils/cn'
import Facts from '../ui/Facts'

/**
 * Admin overview. Charts are plain HTML bars: one series each, except the
 * lot bars, whose two coloured states (occupied, reserved) are a validated
 * colour-blind-safe pair, always shown with a legend and the numbers in text.
 * Free space is the empty track; closed bays are a neutral hatch.
 */

const REFRESH_MS = 30_000
const WEEKDAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const dayLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}`
}

const hatch = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgb(var(--content-subtle) / 0.55) 0 2px, transparent 2px 6px)',
}

const Card = ({ title, aside, children, className }) => (
  <section className={cn('bg-surface border border-hairline rounded-lg p-4 sm:p-5', className)}>
    {(title || aside) && (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
        {title && <h2 className="text-h3 text-content">{title}</h2>}
        {aside}
      </div>
    )}
    {children}
  </section>
)

const Stat = ({ label, value, sub }) => (
  <div className="bg-surface border border-hairline rounded-lg p-4">
    <p className="text-small text-content-muted">{label}</p>
    <p className="mt-1 font-mono text-3xl font-semibold text-content tabular">{value}</p>
    {sub && <p className="mt-1 text-micro text-content-muted">{Array.isArray(sub) ? <Facts items={sub} /> : sub}</p>}
  </div>
)

/** Hover tooltip for one chart; positioned inside the chart's relative box. */
const useTip = () => {
  const [tip, setTip] = useState(null)
  const show = (event, content) => {
    const box = event.currentTarget.closest('[data-chart]').getBoundingClientRect()
    const mark = event.currentTarget.getBoundingClientRect()
    setTip({ x: mark.left - box.left + mark.width / 2, y: mark.top - box.top, content })
  }
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full -mt-2 whitespace-nowrap rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-micro text-content shadow-e2"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  )
  return { show, hide: () => setTip(null), node }
}

const Legend = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-content-muted">
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm bg-chart-occupied" /> มีรถจอด
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm bg-chart-reserved" /> จองแล้ว รอเช็คอิน
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm bg-surface-2 border border-hairline" /> ว่าง
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm border border-hairline" style={hatch} /> ปิดใช้งาน
    </span>
  </div>
)

/** Each lot as one horizontal bar: occupied | reserved | (free track) | closed. */
const LotBars = ({ lots }) => {
  const tip = useTip()
  return (
    <div className="relative space-y-4" data-chart onMouseLeave={tip.hide}>
      {lots.map((lot) => {
        const pct = (n) => (lot.total ? (n / lot.total) * 100 : 0)
        const segments = [
          { key: 'occupied', n: lot.occupied, label: 'มีรถจอด', className: 'bg-chart-occupied' },
          { key: 'reserved', n: lot.reserved, label: 'จองแล้ว รอเช็คอิน', className: 'bg-chart-reserved' },
        ].filter((s) => s.n > 0)
        return (
          <div key={lot.id}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <p className="text-small text-content truncate">
                <span className="font-semibold">{lot.zoneName}</span>
                <span className="ml-2 text-content-muted">{lot.name}</span>
              </p>
              <p className="text-small text-content-muted shrink-0">
                ว่าง <span className="font-mono text-content tabular">{lot.available}</span>/{lot.total - lot.closed}
              </p>
            </div>
            <div className="flex h-3 rounded-[4px] overflow-hidden bg-surface-2 gap-[2px]">
              {segments.map((s) => (
                <div
                  key={s.key}
                  className={cn('h-full', s.className)}
                  style={{ width: `${pct(s.n)}%` }}
                  onMouseEnter={(e) => tip.show(e, `${lot.zoneName}: ${s.label} ${s.n} ช่อง`)}
                />
              ))}
              <div className="flex-1" />
              {lot.closed > 0 && (
                <div
                  className="h-full"
                  style={{ width: `${pct(lot.closed)}%`, ...hatch }}
                  onMouseEnter={(e) => tip.show(e, `${lot.zoneName}: ปิดใช้งาน ${lot.closed} ช่อง`)}
                />
              )}
            </div>
            <p className="mt-1 text-micro text-content-muted">
              <Facts items={[`จอด ${lot.occupied}`, `รอเช็คอิน ${lot.reserved}`, lot.closed > 0 && `ปิด ${lot.closed}`]} />
            </p>
          </div>
        )
      })}
      {tip.node}
    </div>
  )
}

/** Vertical bars for one series. `bars` = [{ key, label, value, tip }]. */
const Columns = ({ bars, height = 160, labelEvery = 1, caption, unit }) => {
  const tip = useTip()
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <figure>
      <div className="relative" data-chart onMouseLeave={tip.hide}>
        <div className="flex items-end gap-[2px] border-b border-hairline" style={{ height }}>
          {bars.map((b) => (
            <div
              key={b.key}
              className="flex-1 h-full flex items-end"
              onMouseEnter={(e) => tip.show(e, b.tip)}
            >
              <div
                className="w-full rounded-t-[4px] bg-chart-occupied"
                style={{ height: b.value ? `${Math.max(2, (b.value / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
        {tip.node}
      </div>
      <div className="flex gap-[2px] mt-1.5">
        {bars.map((b, i) => (
          <span key={b.key} className="flex-1 text-center text-[10px] text-content-subtle tabular">
            {i % labelEvery === 0 ? b.label : ''}
          </span>
        ))}
      </div>
      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{b.value} {unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const AdminDashboard = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await adminAPI.getDashboard()
      setData(res)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดแดชบอร์ดไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  if (!data) return <div className="py-16 grid place-items-center"><Spinner /></div>

  const { totals, today, revenue, weekRevenue, bookingsByHour, attention, lots } = data
  const open = totals.total - totals.closed
  const peak = bookingsByHour.reduce((a, b) => (b.count > a.count ? b : a), bookingsByHour[0])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-micro text-content-muted">อัปเดตล่าสุด {formatTime(data.generatedAt)} น.</p>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load} loading={loading}>
          รีเฟรช
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="ช่องว่างตอนนี้"
          value={`${totals.available}/${open}`}
          sub={[`จอด ${totals.occupied}`, `รอเช็คอิน ${totals.reserved}`, totals.closed > 0 && `ปิด ${totals.closed}`]}
        />
        <Stat
          label="การจองวันนี้"
          value={today.bookings}
          sub={[`เช็คอิน ${today.checkedIn}`, `รอ ${today.waiting}`, `ไม่มา ${today.noShows}`]}
        />
        <Stat
          label="รายได้วันนี้"
          value={formatTHB(today.revenue)}
          sub={[`ค่าจอง ${formatTHB(today.fees)}`, `เกินเวลา ${formatTHB(today.overtime)}`]}
        />
        <Stat label="รายได้ 7 วัน" value={formatTHB(weekRevenue)} sub="ค่าจองรวมค่าจอดเกินเวลาที่เก็บได้" />
      </div>

      {(attention.longParked.length > 0 || attention.unpaid.count > 0) && (
        <Card
          title="ต้องจัดการ"
          className="border-warn/40"
          aside={<AlertTriangle className="w-5 h-5 text-warn" aria-hidden="true" />}
        >
          <ul className="space-y-2">
            {attention.longParked.map((b) => (
              <li key={b.bookingId} className="flex flex-wrap items-center justify-between gap-2 text-small">
                <span className="inline-flex items-center gap-2 text-content">
                  <Clock3 className="w-4 h-4 text-warn" aria-hidden="true" />
                  {b.zoneName} ช่อง <span className="font-mono">{b.spotNumber}</span>
                  {b.licensePlate && <span className="font-mono text-content-muted">{b.licensePlate}</span>}
                </span>
                <span className="text-content-muted">
                  จอดตั้งแต่ {formatDateTime(b.since)} เกิน {attention.longParkHours} ชม. อาจลืมเช็คเอาต์
                </span>
              </li>
            ))}
            {attention.unpaid.count > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2 text-small">
                <span className="inline-flex items-center gap-2 text-content">
                  <Wallet className="w-4 h-4 text-warn" aria-hidden="true" />
                  ตัดเงินไม่ผ่าน {attention.unpaid.count} รายการ รวม {formatTHB(attention.unpaid.amount)}
                </span>
              </li>
            )}
          </ul>
          <Link to="/app/admin/bookings" className="mt-3 inline-block text-small text-brand-600 hover:underline">
            ไปที่หน้าการจอง
          </Link>
        </Card>
      )}

      <Card title="ลานจอดตอนนี้" aside={<Legend />}>
        {lots.length ? <LotBars lots={lots} /> : <p className="text-small text-content-muted">ยังไม่มีลาน</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="รายได้ 7 วันล่าสุด">
          <Columns
            caption="รายได้รายวัน 7 วันล่าสุด"
            unit="บาท"
            bars={revenue.map((r) => ({
              key: r.date,
              label: dayLabel(r.date),
              value: r.total,
              tip: `${dayLabel(r.date)}: ${formatTHB(r.total)} (ค่าจอง ${formatTHB(r.fees)} และเกินเวลา ${formatTHB(r.overtime)})`,
            }))}
          />
        </Card>
        <Card
          title="ช่วงเวลาที่มีคนจอง (7 วัน)"
          aside={peak.count > 0 && <span className="text-micro text-content-muted">มากสุด {String(peak.hour).padStart(2, '0')}:00</span>}
        >
          <Columns
            caption="จำนวนการจองตามชั่วโมง 7 วันล่าสุด"
            unit="ครั้ง"
            labelEvery={3}
            bars={bookingsByHour.map((h) => ({
              key: h.hour,
              label: String(h.hour).padStart(2, '0'),
              value: h.count,
              tip: `${String(h.hour).padStart(2, '0')}:00-${String(h.hour).padStart(2, '0')}:59 จอง ${h.count} ครั้ง`,
            }))}
          />
        </Card>
      </div>
    </div>
  )
}

export default AdminDashboard
