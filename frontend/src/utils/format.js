/** Shared formatters so money, dates and durations read the same everywhere. */

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
})

const bahtPrecise = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Whole baht unless there are satang to show. */
export const formatTHB = (amount) => {
  const value = Number(amount) || 0
  return Number.isInteger(value) ? baht.format(value) : bahtPrecise.format(value)
}

export const formatDateTime = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export const formatTime = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  )
}

export const formatDuration = ({ hours = 0, minutes = 0 }) => {
  if (!hours && !minutes) return '0 นาที'
  if (!hours) return `${minutes} นาที`
  return `${hours} ชม. ${minutes} นาที`
}

/** mm:ss for the check-in countdown. */
export const formatCountdown = (ms) => {
  const safe = Math.max(0, ms)
  const minutes = Math.floor(safe / 60000)
  const seconds = Math.floor((safe % 60000) / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Availability -> the status tone used by badges and meters alike. */
export const availabilityTone = (available, total) => {
  if (!total || available === 0) return 'risk'
  const ratio = available / total
  if (ratio <= 0.15) return 'warn'
  return 'ok'
}
