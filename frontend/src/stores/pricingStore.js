import { create } from 'zustand'
import { pricingAPI } from '../utils/apiService'

/**
 * Pricing, from the server.
 *
 * `backend/config/pricing.js` is the single source of truth and says so, but
 * the frontend used to keep its own copies of every number — the booking fee
 * alone was typed out in seven files, including the terms of service. Changing
 * a fee on the server left the whole UI quoting the old one.
 *
 * The values below are a first-paint fallback only; `hydrate()` replaces them
 * with the server's as soon as it answers. `npm run smoke` asserts that this
 * fallback still matches the backend config, so it cannot drift unnoticed.
 */
export const PRICING_FALLBACK = {
  bookingFee: 20,
  freeHours: 3,
  overtimeRate: 10,
  graceMinutes: 30,
}

/** Discount percentages per paid tier, used in the marketing and legal copy. */
export const TIER_DISCOUNT_FALLBACK = {
  diamond: 10,
  predator: 15,
}

export const usePricingStore = create((set, get) => ({
  pricing: PRICING_FALLBACK,
  tiers: [],
  tierDiscount: TIER_DISCOUNT_FALLBACK,
  loaded: false,

  hydrate: async () => {
    if (get().loaded) return

    try {
      const { data } = await pricingAPI.get()
      if (!data?.pricing) return

      const tiers = data.tiers || []
      const tierDiscount = tiers.reduce(
        (out, tier) => ({ ...out, [tier.id]: tier.discount }),
        {}
      )

      set({
        pricing: { ...PRICING_FALLBACK, ...data.pricing },
        tiers,
        // An empty tier list must not blank out the copy that reads from this.
        tierDiscount: Object.keys(tierDiscount).length ? tierDiscount : TIER_DISCOUNT_FALLBACK,
        loaded: true,
      })
    } catch {
      // Offline or the API is down: the fallback keeps the page readable, and
      // every figure it shows was correct at build time.
    }
  },
}))

/** Read-only accessor for components that only need the numbers. */
export const usePricing = () => usePricingStore((s) => s.pricing)
