---
name: SciPark Design System
version: 3.0.0
updated: 2026-09-18
mode: light + dark (system preference, user overridable)
font:
  display: "Anuphan"        # Thai + Latin, geometric, ships real Thai glyphs
  body: "Anuphan"
  mono: "JetBrains Mono"    # spot numbers, timers, money
color:
  # Brand — signal blue. Parking wayfinding is blue worldwide.
  brand-50:  "#eef4ff"
  brand-100: "#dce7ff"
  brand-200: "#bed3ff"
  brand-300: "#91b5ff"
  brand-400: "#5c8cff"
  brand-500: "#3563f0"   # primary action
  brand-600: "#2348d4"
  brand-700: "#1c39ab"
  brand-800: "#1b3287"
  brand-900: "#1b2e6b"
  # Neutrals — slightly cool ink, never pure black on pure white
  ink-50:  "#f7f8fa"
  ink-100: "#eef0f4"
  ink-200: "#dfe3ea"
  ink-300: "#c5ccd8"
  ink-400: "#97a1b2"
  ink-500: "#6b7688"
  ink-600: "#4c5566"
  ink-700: "#39404e"
  ink-800: "#242a35"
  ink-900: "#161a22"
  ink-950: "#0e1117"
  # Status — reserved words. Never used decoratively.
  ok:    "#0f9d58"   # spot available, check-in success
  warn:  "#e8830c"   # countdown running low, overtime accruing
  risk:  "#dc2626"   # expired, cancelled, payment declined
  info:  "#3563f0"
radius: { sm: "8px", md: "12px", lg: "16px", xl: "22px", pill: "999px" }
space:  { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 7: "48px", 8: "64px" }
elevation:
  1: "0 1px 2px rgb(22 26 34 / .06), 0 1px 3px rgb(22 26 34 / .04)"
  2: "0 4px 10px rgb(22 26 34 / .07), 0 2px 4px rgb(22 26 34 / .04)"
  3: "0 12px 28px rgb(22 26 34 / .10), 0 4px 10px rgb(22 26 34 / .05)"
motion:
  fast: "140ms"
  base: "220ms"
  slow: "420ms"
  ease: "cubic-bezier(.22,.8,.29,1)"
---

# SciPark Design System

## Why this document exists

The reference sites the team shared fall into two camps, and SciPark needs
different things from each:

| Reference | What it actually is | What we take |
|---|---|---|
| **getdesign.md / designmd.app** | A *format*: design tokens written down in front matter, prose rationale below, so humans and AI agents build the same UI twice | The method. This file is that format. Every colour, radius and duration in the codebase resolves to a token declared above. |
| **motionsites.ai** | Dark, neon-gradient, scroll-triggered, glassmorphic marketing pages | The motion vocabulary — scroll reveals, stagger, spring — **for the landing page only**. |

The split matters. SciPark is used standing next to a car, one-handed, in
Bangkok sunlight, often in a hurry with a 30-minute timer running. A dashboard
that behaves like a showreel is a worse dashboard. So:

> **Marketing surfaces may perform. Product surfaces must not.**

## Principles

1. **Legible outdoors.** Body text sits at ≥ 4.5:1 contrast, primary numerals
   at ≥ 7:1. No text over busy gradients. No thin weights below 16px.
2. **Status colour is reserved.** Green/amber/red mean available/urgent/lost.
   Nothing decorative may borrow them, or a red badge stops meaning anything.
3. **One accent.** Brand blue carries actions. The old build gradient-washed
   every surface in blue→purple→orange, which left nothing to draw the eye.
4. **Motion explains, then stops.** Animation shows where a thing came from or
   that time is passing. Idle loops on a screen with a live countdown compete
   with the only animation that matters.
5. **Respect `prefers-reduced-motion`.** Every transition collapses to opacity.
6. **Thai first.** The UI is Thai. Inter and Poppins ship no Thai glyphs, so the
   old build silently fell back to a system font mid-sentence — mismatched
   x-height and weight on every screen. Anuphan covers both scripts.

## Type scale

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 44–72px clamp / 1.05 | 600 | Landing hero only |
| `h1` | 30px / 1.2 | 600 | Page title |
| `h2` | 22px / 1.3 | 600 | Section |
| `h3` | 18px / 1.4 | 600 | Card title |
| `body` | 16px / 1.6 | 400 | Default |
| `small` | 14px / 1.5 | 400 | Secondary |
| `micro` | 12px / 1.4 | 500, +0.04em | Labels, badges |
| `numeric` | mono, tabular-nums | 500 | Timers, money, spot IDs |

Timers and prices use `font-variant-numeric: tabular-nums` so digits do not
jitter as a countdown ticks.

## Components

- **Button** — `solid` (brand, primary action), `soft` (brand tint), `outline`,
  `ghost`, `danger`. Radius `md`. Height 44px default, 52px `lg` — 44px is the
  minimum comfortable touch target one-handed. Hover lifts elevation by one
  step; it does not scale. Scaling buttons on a touch screen reads as jitter.
- **Card** — surface + hairline border + elevation 1. Radius `lg`. Hover raises
  to elevation 2 only when the whole card is a link.
- **StatusDot / Badge** — status colour + text label. Never colour alone:
  ~8% of men cannot separate the red and green states.
- **Countdown** — mono, tabular, and it changes *colour* (ink → warn → risk) and
  gains a pulse only under 5 minutes. Urgency is spent, not constant.
- **Sheet / Modal** — spring in from 8px below, backdrop blur 8px.
- **Input** — 44px, 2px border, brand ring on focus. Focus is always visible.

## Layout

- App shell: fixed top bar (64px) + bottom tab bar (68px) under `lg`, sidebar
  rail at `lg`+. Content max-width 1180px, 16px side gutters on mobile.
- Content sits inside `pb-[88px]` on mobile so the tab bar never covers the last
  row — the old build let it sit on top of page content.

## Dark mode

`:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`. Dark
surfaces step `ink-950 → ink-900 → ink-800`; brand lightens to `brand-400` so it
keeps contrast on dark. Status colours lighten one step. Elevation switches from
shadow to a lighter surface, because shadows are invisible on near-black.

## What the parking products actually do

v2 was token-correct and completely forgettable. The fix came from looking at
what shipping parking products do, rather than at what generic SaaS sites do.

| Product | What it leads with | What we took |
|---|---|---|
| [SpotHero](https://spothero.com/) | The booking widget sits *in* the hero, over a real driver photo, then hard numbers: 100M+ cars parked, 300K+ reviews, 400+ cities. Prices shown as badges on a map. | Put the product in the hero. Our hero shows the five lots' **live** availability — the same data the app runs on — and a stat band of real capacity. |
| [JustPark](https://www.justpark.com/) / [Parkopedia](https://www.parkopedia.com/) | Map first, list second. A spot is a pin with a price on it. | The campus map is the first thing on the home screen. |
| [AirGarage](https://www.airgarage.com/) | Oversized numerals as the visual anchor ("350+ locations", "14M sessions"); photography over illustration; confident and data-led. | Availability is now set in 36–48px mono numerals. The number *is* the design. |
| [SpotAngels live-map case study](https://uxdesign.cc/how-to-improve-the-parking-experience-97244342e0a) | Drivers decide on three things: is there space, what does it cost, and how far do I then walk. | Added `walkMinutes` to the data model and put it on every card, pin and detail header. |

### The three things that were missing

1. **No map.** Parking is a spatial problem and v2 answered it with a text list.
   `CampusMap` is a schematic of the faculty with one pin per lot, coloured by
   availability. Hand-drawn SVG rather than a tile service: five lots around one
   building needs no API key, no per-load cost and no city-scale clutter.
2. **Availability was whispered.** It lived in a small badge while a description
   nobody picks a car park by got the space. It is now the largest element on the
   card, in the status colour, with a ten-segment meter beside it — segments read
   as "how many bays", a smooth bar reads as a meaningless percentage.
3. **No walking distance.** The usual tie-breaker between two lots with space was
   not in the product at all.

### Rules this adds

- **A lot is drawn as a lot.** `LotPlan` groups bays back into their painted rows
  with a driving lane between facing ranks, so "your bay is A01" means something
  before the driver arrives. A flat grid of squares told them nothing.
- **Status colour still governs.** The map, the pin, the numeral, the meter and
  the badge on a given lot always agree, because all five derive from one
  `availabilityTone()` call.
- **Live beats claimed.** Where a number can be fetched, fetch it. The landing
  page quotes real capacity and real free bays, not copy written months ago.

## What changed from v1

| v1 | v2 | Reason |
|---|---|---|
| Inter + Poppins | Anuphan | v1 shipped no Thai glyphs at all |
| blue→purple→orange gradients everywhere | one brand blue, flat surfaces | nothing stood out when everything did |
| `rounded-3xl` (24px) on everything | 8/12/16/22 scale by role | uniform radius flattens hierarchy |
| `hover:scale-105` on buttons/cards | elevation + colour | scaling is jittery on touch |
| infinite pulse on idle badges | motion only on state change | competed with the real countdown |
| no dark mode | full dark mode | the app is used in car parks at night |
| `transition-property: all` on `*` | targeted transitions | forced style recalc on every paint |

## What changed from v2

| v2 | v3 | Reason |
|---|---|---|
| zone list only | campus map + list | parking is spatial; a list cannot answer "how far do I walk" |
| availability in a small badge | 4xl mono numeral + segment meter | it is the whole decision |
| no distance data | `walkMinutes` on every lot | the tie-breaker between two lots with space |
| flat grid of spot squares | `LotPlan` with rows and a driving lane | a plan a driver recognises from the tarmac |
| static copy in the hero | live availability fetched from the API | a claim you can check beats a claim |
| pricing cards stretched to equal height | `self-start` | Iron has three fewer features, which left a large void above its button |
| "current plan" badge hung off the card edge | badge inside the header row | the negative offset clipped it against the section boundary |
