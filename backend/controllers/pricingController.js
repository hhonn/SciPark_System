import { TIER_LIST, publicPricing, publicTier } from "../config/pricing.js";

/*
    @desc   Fees, the free allowance, the check-in grace period and the tiers
    @route  GET /api/pricing
    @access Public

    Public on purpose: the landing page, the terms of service and the privacy
    policy all quote these numbers and none of them is behind a login.
*/
export const getPricing = (req, res) => {
  // Nothing here is per-user or time-sensitive, so it is safe to cache briefly.
  // Prices change on a deploy, not on a request.
  res.set("Cache-Control", "public, max-age=300");

  res.status(200).json({
    success: true,
    pricing: publicPricing(),
    tiers: TIER_LIST.map(publicTier),
  });
};

export default { getPricing };
