import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Car, CreditCard, ArrowRight, CheckCircle2 } from 'lucide-react'
import Button from '../components/ui/Button'
import Logo from '../components/Logo'
import { useAuthStore } from '../stores/authStore'
import { usePricing } from '../stores/pricingStore'

/**
 * Post-registration setup prompt.
 *
 * A booking needs a payment method, so new users are pointed at that first
 * rather than discovering the requirement when their first booking is refused.
 */
const buildSteps = ({ bookingFee }) => [
  {
    icon: CreditCard,
    title: 'เพิ่มวิธีการชำระเงิน',
    body: `จำเป็นสำหรับค่าธรรมเนียมการจอง ${bookingFee} บาท`,
    to: '/app/payment-methods',
    cta: 'เพิ่มเลย',
    required: true,
  },
  {
    icon: Car,
    title: 'เพิ่มยานพาหนะ',
    body: 'ใช้ยืนยันตัวตนตอนเข้าจอด (ไม่บังคับ)',
    to: '/app/profile?tab=vehicles',
    cta: 'เพิ่มรถ',
    required: false,
  },
]

const Welcome = () => {
  const user = useAuthStore((s) => s.user)
  const pricing = usePricing()
  const steps = buildSteps(pricing)
  const reduce = useReducedMotion()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 0.8, 0.29, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <span className="inline-flex w-14 h-14 rounded-full bg-ok/12 text-ok items-center justify-center mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </span>
          <h1 className="text-h1 text-content">
            ยินดีต้อนรับ {user?.name?.split(' ')[0] || ''}
          </h1>
          <p className="mt-2 text-small text-content-muted">
            อีกสองขั้นตอนก่อนจองที่จอดครั้งแรก
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.08 }}
              className="bg-surface border border-hairline rounded-lg p-4 flex items-center gap-4"
            >
              <span className="w-11 h-11 rounded-md bg-brand-500/10 text-brand-600 flex items-center justify-center shrink-0">
                <step.icon className="w-5 h-5" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold text-content">
                  {step.title}
                  {step.required && <span className="ml-1.5 text-risk">*</span>}
                </p>
                <p className="text-small text-content-muted">{step.body}</p>
              </div>

              <Link to={step.to} className="shrink-0">
                <Button size="sm" variant={step.required ? 'solid' : 'outline'}>
                  {step.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>

        <Link to="/app" className="block mt-6">
          <Button variant="ghost" fullWidth iconRight={ArrowRight}>
            ข้ามไปก่อน ไปหน้าหลัก
          </Button>
        </Link>

        <div className="mt-8 flex items-center justify-center gap-2 text-content-subtle">
          <Logo className="w-5 h-5" />
          <span className="text-micro">SciPark</span>
        </div>
      </motion.div>
    </div>
  )
}

export default Welcome
