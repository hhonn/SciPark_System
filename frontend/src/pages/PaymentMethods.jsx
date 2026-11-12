import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CreditCard, Plus, Trash2, Star, Smartphone, Landmark } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Loading'
import { paymentAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { cn } from '../utils/cn'

const TYPES = [
  { id: 'credit_card', label: 'บัตรเครดิต', icon: CreditCard },
  { id: 'debit_card', label: 'บัตรเดบิต', icon: CreditCard },
  { id: 'promptpay', label: 'พร้อมเพย์', icon: Smartphone },
  { id: 'truewallet', label: 'TrueWallet', icon: Smartphone },
  { id: 'bank_transfer', label: 'โอนผ่านธนาคาร', icon: Landmark },
]

const TYPE_ICON = {
  credit_card: CreditCard,
  debit_card: CreditCard,
  promptpay: Smartphone,
  truewallet: Smartphone,
  bank_transfer: Landmark,
}

const emptyForm = {
  type: 'credit_card',
  cardNumber: '',
  cardHolderName: '',
  expiryMonth: '',
  expiryYear: '',
  phoneNumber: '',
  bankName: '',
  accountNumber: '',
  accountName: '',
  isDefault: false,
}

/** Group digits in fours as the user types, for readability only. */
const formatCardInput = (value) =>
  value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim()

const PaymentMethods = () => {
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    try {
      const { data } = await paymentAPI.getAll()
      setMethods(data.data || [])
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isCard = form.type === 'credit_card' || form.type === 'debit_card'
  const isWallet = form.type === 'promptpay' || form.type === 'truewallet'
  const isBank = form.type === 'bank_transfer'

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      const payload = { type: form.type, isDefault: form.isDefault }

      if (isCard) {
        // The server keeps only the last four digits; the full number never
        // reaches the database.
        Object.assign(payload, {
          cardNumber: form.cardNumber.replace(/\s/g, ''),
          cardHolderName: form.cardHolderName,
          expiryMonth: form.expiryMonth,
          expiryYear: form.expiryYear,
        })
      } else if (isWallet) {
        payload.phoneNumber = form.phoneNumber
      } else if (isBank) {
        Object.assign(payload, {
          bankName: form.bankName,
          accountNumber: form.accountNumber,
          accountName: form.accountName,
        })
      }

      await paymentAPI.create(payload)
      setModalOpen(false)
      setForm(emptyForm)
      toast.success('เพิ่มวิธีการชำระเงินแล้ว')
      await load()
    } catch (error) {
      toast.error(apiErrorMessage(error, 'เพิ่มไม่สำเร็จ'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    const snapshot = methods
    setMethods((prev) => prev.filter((m) => m.id !== id))
    try {
      await paymentAPI.delete(id)
      toast.success('ลบแล้ว')
    } catch (error) {
      setMethods(snapshot)
      toast.error(apiErrorMessage(error))
    }
  }

  const makeDefault = async (id) => {
    try {
      await paymentAPI.setDefault(id)
      setMethods((prev) => prev.map((m) => ({ ...m, isDefault: m.id === id })))
      toast.success('ตั้งเป็นวิธีหลักแล้ว')
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  if (loading) return <PageLoader label="กำลังโหลดวิธีการชำระเงิน..." />

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link
        to="/app/profile"
        className="inline-flex items-center gap-1.5 text-small text-content-muted hover:text-content transition-colors duration-fast"
      >
        <ArrowLeft className="w-4 h-4" />
        โปรไฟล์
      </Link>

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-content">วิธีการชำระเงิน</h1>
          <p className="mt-1 text-small text-content-muted">
            ใช้สำหรับค่าธรรมเนียมการจองและค่าจอดเกินเวลา
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModalOpen(true)} className="shrink-0">
          เพิ่ม
        </Button>
      </header>

      {methods.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-lg">
          <EmptyState
            icon={CreditCard}
            title="ยังไม่มีวิธีการชำระเงิน"
            description="ต้องเพิ่มอย่างน้อยหนึ่งวิธีก่อนจึงจะจองที่จอดได้"
            action={
              <Button icon={Plus} onClick={() => setModalOpen(true)}>
                เพิ่มวิธีการชำระเงิน
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map((method) => {
            const Icon = TYPE_ICON[method.type] || CreditCard
            return (
              <div
                key={method.id}
                className={cn(
                  'bg-surface border rounded-lg p-4 flex items-center gap-4',
                  method.isDefault ? 'border-brand-500/40' : 'border-hairline'
                )}
              >
                <span className="w-11 h-11 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-content-muted" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-content truncate">
                    {method.displayName}
                  </p>
                  {method.cardHolderName && (
                    <p className="text-small text-content-muted truncate">
                      {method.cardHolderName}
                      {method.expiryMonth && (
                        <span className="ml-3">หมดอายุ {method.expiryMonth}/{method.expiryYear}</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {method.isDefault ? (
                    <Badge tone="brand" icon={Star}>
                      หลัก
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => makeDefault(method.id)}
                      aria-label="ตั้งเป็นวิธีหลัก"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(method.id)}
                    aria-label="ลบ"
                    className="text-risk hover:text-risk"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-micro text-content-subtle">
        ระบบเก็บเฉพาะเลขบัตร 4 ตัวท้ายเพื่อให้คุณจำได้ว่าเป็นบัตรใบไหน ไม่มีการเก็บหมายเลขบัตรเต็ม
      </p>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="เพิ่มวิธีการชำระเงิน"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setModalOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="submit" form="add-payment-form" fullWidth loading={saving}>
              บันทึก
            </Button>
          </div>
        }
      >
        <form id="add-payment-form" onSubmit={submit} className="space-y-4">
          <div>
            <span className="block mb-2 text-small font-medium text-content">ประเภท</span>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setForm({ ...emptyForm, type: type.id, isDefault: form.isDefault })}
                  className={cn(
                    'flex items-center gap-2 h-11 px-3 rounded-md border-2 text-small font-medium',
                    'transition-colors duration-fast',
                    form.type === type.id
                      ? 'border-brand-500 bg-brand-500/8 text-brand-600'
                      : 'border-hairline text-content-muted hover:border-brand-500/40'
                  )}
                >
                  <type.icon className="w-4 h-4 shrink-0" />
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {isCard && (
            <>
              <Input
                label="หมายเลขบัตร"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4111 1111 1111 1111"
                value={form.cardNumber}
                onChange={(e) => setForm({ ...form, cardNumber: formatCardInput(e.target.value) })}
                className="font-mono"
                data-autofocus
              />
              <Input
                label="ชื่อบนบัตร"
                autoComplete="cc-name"
                placeholder="SOMCHAI JAIDEE"
                value={form.cardHolderName}
                onChange={(e) => setForm({ ...form, cardHolderName: e.target.value.toUpperCase() })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="เดือนหมดอายุ"
                  inputMode="numeric"
                  placeholder="12"
                  maxLength={2}
                  value={form.expiryMonth}
                  onChange={(e) =>
                    setForm({ ...form, expiryMonth: e.target.value.replace(/\D/g, '') })
                  }
                  className="font-mono"
                />
                <Input
                  label="ปีหมดอายุ"
                  inputMode="numeric"
                  placeholder="2028"
                  maxLength={4}
                  value={form.expiryYear}
                  onChange={(e) =>
                    setForm({ ...form, expiryYear: e.target.value.replace(/\D/g, '') })
                  }
                  className="font-mono"
                />
              </div>
            </>
          )}

          {isWallet && (
            <Input
              label="เบอร์โทรศัพท์"
              inputMode="numeric"
              placeholder="0812345678"
              value={form.phoneNumber}
              onChange={(e) =>
                setForm({ ...form, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              className="font-mono"
              data-autofocus
            />
          )}

          {isBank && (
            <>
              <Input
                label="ธนาคาร"
                placeholder="กสิกรไทย"
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                data-autofocus
              />
              <Input
                label="เลขที่บัญชี"
                inputMode="numeric"
                placeholder="1234567890"
                value={form.accountNumber}
                onChange={(e) =>
                  setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })
                }
                className="font-mono"
              />
              <Input
                label="ชื่อบัญชี"
                placeholder="สมชาย ใจดี"
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              />
            </>
          )}

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="w-4 h-4 rounded accent-brand-500"
            />
            <span className="text-small text-content">ตั้งเป็นวิธีการชำระเงินหลัก</span>
          </label>
        </form>
      </Modal>
    </div>
  )
}

export default PaymentMethods
