import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Crown, Gift, Sparkles, Ticket } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { PageLoader } from '../components/ui/Loading'
import { privilegesAPI, paymentAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { usePricing } from '../stores/pricingStore'
import { formatTHB, formatDateTime } from '../utils/format'
import { cn } from '../utils/cn'
import PointsPanel from '../components/PointsPanel'

const TIER_ACCENT = {
  iron: 'border-hairline',
  diamond: 'border-brand-500/45',
  predator: 'border-warn/45',
}

const Privileges = () => {
  const navigate = useNavigate()
  const updateUser = useAuthStore((s) => s.updateUser)
  const { bookingFee } = usePricing()

  const [tiers, setTiers] = useState([])
  const [currentTier, setCurrentTier] = useState('Iron')
  const [subscription, setSubscription] = useState(null)
  const [activeDiscount, setActiveDiscount] = useState(null)
  const [points, setPoints] = useState(0)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading] = useState(true)

  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [confirmTier, setConfirmTier] = useState(null)
  const [subscribing, setSubscribing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [tierRes, paymentRes] = await Promise.allSettled([
        privilegesAPI.getTiers(),
        paymentAPI.getAll(),
      ])

      if (tierRes.status === 'fulfilled') {
        const { tiers: list, currentTier: current, subscription: sub, points: pts, activeDiscount: discount } =
          tierRes.value.data
        setTiers(list || [])
        setCurrentTier(current || 'Iron')
        setSubscription(sub)
        setPoints(pts || 0)
        setActiveDiscount(discount)
      }

      if (paymentRes.status === 'fulfilled') setPaymentMethods(paymentRes.value.data.data || [])
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const redeem = async (event) => {
    event.preventDefault()
    if (!code.trim()) return

    setRedeeming(true)
    try {
      const { data } = await privilegesAPI.redeemCode(code.trim())
      toast.success(data.message)
      setCode('')
      await load()
    } catch (error) {
      toast.error(apiErrorMessage(error, 'แลกโค้ดไม่สำเร็จ'))
    } finally {
      setRedeeming(false)
    }
  }

  const subscribe = async () => {
    setSubscribing(true)
    try {
      const defaultMethod =
        paymentMethods.find((m) => m.isDefault)?.id || paymentMethods[0]?.id
      const { data } = await privilegesAPI.subscribe(confirmTier.id, defaultMethod)

      toast.success(data.message)
      updateUser({ rank: confirmTier.name })
      setConfirmTier(null)
      await load()
    } catch (error) {
      const message = apiErrorMessage(error, 'สมัครสมาชิกไม่สำเร็จ')
      toast.error(message)
      if (error.response?.data?.code === 'no_payment_method') {
        setConfirmTier(null)
        navigate('/app/payment-methods')
      }
    } finally {
      setSubscribing(false)
    }
  }

  if (loading) return <PageLoader label="กำลังโหลดสิทธิพิเศษ..." />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-h1 text-content">สิทธิพิเศษ</h1>
        <p className="mt-1 text-small text-content-muted">
          สมาชิกรับส่วนลดค่าจอดเกินเวลา และสะสมแต้มได้มากขึ้น
        </p>
      </header>

      {/* Current standing */}
      <section className="bg-surface border border-hairline rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-micro text-content-subtle">ระดับปัจจุบัน</p>
            <p className="mt-0.5 text-h1 text-content">{currentTier}</p>
            {subscription && (
              <p className="mt-1 text-small text-content-muted">
                หมดอายุ {formatDateTime(subscription.expiresAt)}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-micro text-content-subtle">แต้มสะสม</p>
            <p className="mt-0.5 font-mono text-h1 text-content tabular">{points}</p>
          </div>
        </div>

        {activeDiscount?.percent > 0 && (
          <div className="mt-4 flex items-start gap-3 p-3 rounded-md bg-ok/10 border border-ok/25">
            <Gift className="w-5 h-5 text-ok shrink-0 mt-0.5" />
            <p className="text-small text-content">
              คุณมีส่วนลด{' '}
              <strong className="font-semibold">{activeDiscount.percent}%</strong>{' '}
              สำหรับค่าจอดเกินเวลาครั้งถัดไป
              {activeDiscount.expiresAt && (
                <span className="text-content-muted">
                  {' '}
                  (ถึง {formatDateTime(activeDiscount.expiresAt)})
                </span>
              )}
            </p>
          </div>
        )}
      </section>

      {/* A reward can change the tier or add a voucher: refresh the card above. */}
      <PointsPanel onChange={load} />

      {/* Promo code */}
      <section className="bg-surface border border-hairline rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="w-4 h-4 text-content-subtle" />
          <h2 className="text-h3 text-content">แลกโค้ดส่วนลด</h2>
        </div>

        <form onSubmit={redeem} className="flex gap-2">
          <Input
            placeholder="กรอกโค้ด เช่น WELCOME100"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="font-mono uppercase"
          />
          <Button type="submit" loading={redeeming} disabled={!code.trim()} className="shrink-0">
            แลก
          </Button>
        </form>
      </section>

      {/* Tiers */}
      <section className="space-y-4">
        <h2 className="text-h2 text-content">แพ็กเกจสมาชิก</h2>

        <div className="grid gap-4 sm:grid-cols-3 items-start">
          {tiers.map((tier) => {
            const isCurrent = tier.name === currentTier
            const isFree = tier.price === 0

            return (
              <div
                key={tier.id}
                className={cn(
                  // `self-start` stops the grid stretching every card to the
                  // tallest one. Iron has three fewer features than Predator, so
                  // stretching left a large empty void above its button.
                  'relative self-start bg-surface border rounded-lg p-5 flex flex-col',
                  TIER_ACCENT[tier.id],
                  isCurrent && 'ring-2 ring-brand-500/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tier.id === 'predator' ? (
                      <Crown className="w-5 h-5 text-warn shrink-0" />
                    ) : tier.id === 'diamond' ? (
                      <Sparkles className="w-5 h-5 text-brand-500 shrink-0" />
                    ) : null}
                    <h3 className="text-h3 text-content truncate">{tier.name}</h3>
                  </div>

                  {/* Sits inside the card. Hanging it off the top edge with a
                      negative offset clipped it against the section boundary. */}
                  {isCurrent && (
                    <Badge tone="brand" className="shrink-0">
                      ใช้งานอยู่
                    </Badge>
                  )}
                </div>

                <p className="mt-3">
                  <span className="font-mono text-h1 font-semibold text-content tabular">
                    {isFree ? 'ฟรี' : formatTHB(tier.price)}
                  </span>
                  {!isFree && <span className="text-small text-content-muted"> /เดือน</span>}
                </p>

                {tier.discount > 0 ? (
                  <p className="mt-1 text-small text-ok font-medium">
                    ลดค่าจอดเกิน {tier.discount}%
                  </p>
                ) : (
                  <p className="mt-1 text-small text-content-subtle">ไม่มีส่วนลดค่าจอดเกิน</p>
                )}

                <ul className="mt-4 space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-small text-content-muted">
                      <Check className="w-4 h-4 text-ok shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {!isFree && !isCurrent && (
                  <Button className="mt-5" fullWidth onClick={() => setConfirmTier(tier)}>
                    สมัคร {tier.name}
                  </Button>
                )}
                {isCurrent && (
                  <Button className="mt-5" fullWidth variant="outline" disabled>
                    ระดับปัจจุบัน
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-micro text-content-subtle">
          {`ส่วนลดใช้กับค่าจอดเกินเวลาเท่านั้น ค่าธรรมเนียมการจอง ${bookingFee} บาทต่อครั้งไม่มีส่วนลด`}
        </p>
      </section>

      {/* Subscribe confirmation */}
      <Modal
        open={Boolean(confirmTier)}
        onClose={() => !subscribing && setConfirmTier(null)}
        title={`สมัคร ${confirmTier?.name || ''}`}
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setConfirmTier(null)}
              disabled={subscribing}
            >
              ยกเลิก
            </Button>
            <Button fullWidth onClick={subscribe} loading={subscribing} data-autofocus>
              ชำระ {formatTHB(confirmTier?.price)}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-small text-content-muted">
            สมาชิกมีอายุ 30 วัน นับจากวันที่ชำระเงิน และจะไม่ต่ออายุอัตโนมัติ
          </p>

          {paymentMethods.length === 0 ? (
            <div className="p-3 rounded-md bg-risk/8 border border-risk/25 text-small text-content">
              ยังไม่มีวิธีการชำระเงิน ระบบจะพาไปเพิ่มก่อน
            </div>
          ) : (
            <div className="p-3 rounded-md bg-surface-2 text-small text-content-muted">
              ชำระด้วย{' '}
              <span className="text-content font-medium">
                {(paymentMethods.find((m) => m.isDefault) || paymentMethods[0]).displayName}
              </span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default Privileges
