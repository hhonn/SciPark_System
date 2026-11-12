import { useCallback, useEffect, useState } from 'react'
import { Coins, Gift, History, Ticket, Crown, Percent } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from './ui/Button'
import Badge from './ui/Badge'
import Modal from './ui/Modal'
import { pointsAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { formatDateTime } from '../utils/format'
import { cn } from '../utils/cn'

const REWARD_ICON = { free_booking: Ticket, overtime_voucher: Percent, diamond_trial: Crown }

const REASON_LABEL = {
  session: 'จอดเสร็จสิ้น',
  promo_code: 'โปรโมโค้ด',
  redeem_reward: 'แลกรางวัล',
  expired: 'แต้มหมดอายุ',
  opening_balance: 'ยอดยกมา',
  admin_adjust: 'ปรับโดยเจ้าหน้าที่',
}

/**
 * Points: how they are earned, what they buy, and where they went.
 * `onChange` lets the page refresh what a reward affects (tier, voucher).
 */
const PointsPanel = ({ onChange }) => {
  const [data, setData] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: res } = await pointsAPI.get()
      setData(res)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดข้อมูลแต้มไม่สำเร็จ'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const redeem = async () => {
    setBusy(true)
    try {
      const { data: res } = await pointsAPI.redeem(confirm.id)
      toast.success(res.message, { duration: 5000 })
      setConfirm(null)
      await load()
      onChange?.()
    } catch (error) {
      toast.error(apiErrorMessage(error, 'แลกแต้มไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  const { balance, rules, rewards, history, freeBookingCredits, expiresAt } = data

  return (
    <section className="bg-surface border border-hairline rounded-lg p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-content-subtle" />
          <h2 className="text-h3 text-content">แลกแต้ม</h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-h2 text-content tabular">{balance} แต้ม</p>
          {expiresAt && (
            <p className="text-micro text-content-subtle">หมดอายุ {formatDateTime(expiresAt)} ถ้าไม่มีการใช้งาน</p>
          )}
        </div>
      </div>

      {/* How to earn — so the number above means something. */}
      <div className="rounded-md bg-surface-2 p-3 text-small text-content-muted space-y-0.5">
        <p>
          จอดเสร็จ (เช็คอินและเช็คเอาต์) ได้ <strong className="text-content">{rules.completedSession}</strong> แต้ม
          ถ้าออกภายใน {rules.freeHours} ชม. ฟรี ได้โบนัสอีก <strong className="text-content">+{rules.onTimeBonus}</strong>
        </p>
        <p>ระดับของคุณได้แต้ม ×{rules.multiplier}</p>
        <p>
          จองแล้วไม่มาไม่ได้แต้ม และแต้มจะหมดอายุถ้าไม่ได้ใช้งาน {Math.round(rules.inactivityExpiryDays / 30)} เดือน
        </p>
      </div>

      {freeBookingCredits > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-ok/10 border border-ok/25">
          <Gift className="w-5 h-5 text-ok shrink-0" />
          <p className="text-small text-content">
            คุณมีสิทธิ์จองฟรี <strong>{freeBookingCredits}</strong> ครั้ง เลือกใช้ได้ตอนยืนยันการจอง
          </p>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-3">
        {rewards.map((reward) => {
          const Icon = REWARD_ICON[reward.id] || Gift
          const affordable = balance >= reward.cost
          return (
            <li
              key={reward.id}
              className={cn(
                'rounded-lg border p-4 flex flex-col gap-2',
                affordable ? 'border-brand-500/30' : 'border-hairline'
              )}
            >
              <Icon className="w-5 h-5 text-brand-600" />
              <p className="text-body font-medium text-content">{reward.name}</p>
              <p className="text-small text-content-muted flex-1">{reward.description}</p>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={affordable ? 'brand' : 'neutral'}>{reward.cost} แต้ม</Badge>
                <Button size="sm" variant="soft" disabled={!affordable} onClick={() => setConfirm(reward)}>
                  แลก
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {history.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-small font-medium text-content-muted hover:text-content">
            <History className="w-4 h-4" />
            ประวัติแต้มล่าสุด
          </summary>
          <ul className="mt-3 divide-y divide-hairline">
            {history.map((h) => (
              <li key={h.id} className="py-2 flex items-center justify-between gap-3 text-small">
                <div className="min-w-0">
                  <p className="text-content truncate">{h.note || REASON_LABEL[h.reason] || h.reason}</p>
                  <p className="text-micro text-content-subtle">{formatDateTime(h.createdAt)}</p>
                </div>
                <span className={cn('font-mono tabular shrink-0', h.delta > 0 ? 'text-ok' : 'text-risk')}>
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => !busy && setConfirm(null)}
        title={`แลก "${confirm?.name}"?`}
        description={confirm && `ใช้ ${confirm.cost} แต้ม เหลือ ${balance - confirm.cost} แต้ม`}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" fullWidth disabled={busy} onClick={() => setConfirm(null)}>ยกเลิก</Button>
            <Button fullWidth loading={busy} onClick={redeem}>แลกเลย</Button>
          </div>
        }
      >
        <p className="text-small text-content-muted">{confirm?.description}</p>
      </Modal>
    </section>
  )
}

export default PointsPanel
