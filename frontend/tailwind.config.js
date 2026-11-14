/** @type {import('tailwindcss').Config} */

// Every value here mirrors a token declared in /DESIGN.md. Colours resolve
// through CSS custom properties so one set of class names renders correctly in
// both light and dark mode.
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ['variant', [
    '@media (prefers-color-scheme: dark) { &:not(:where([data-theme="light"], [data-theme="light"] *)) }',
    '&:where([data-theme="dark"], [data-theme="dark"] *)',
  ]],
  theme: {
    extend: {
      colors: {
        brand: {
          50: withVar('--brand-50'),
          100: withVar('--brand-100'),
          200: withVar('--brand-200'),
          300: withVar('--brand-300'),
          400: withVar('--brand-400'),
          500: withVar('--brand-500'),
          600: withVar('--brand-600'),
          700: withVar('--brand-700'),
          800: withVar('--brand-800'),
          900: withVar('--brand-900'),
        },
        ink: {
          50: withVar('--ink-50'),
          100: withVar('--ink-100'),
          200: withVar('--ink-200'),
          300: withVar('--ink-300'),
          400: withVar('--ink-400'),
          500: withVar('--ink-500'),
          600: withVar('--ink-600'),
          700: withVar('--ink-700'),
          800: withVar('--ink-800'),
          900: withVar('--ink-900'),
          950: withVar('--ink-950'),
        },
        // Semantic surfaces. These flip with the theme.
        canvas: withVar('--canvas'),
        surface: withVar('--surface'),
        'surface-2': withVar('--surface-2'),
        hairline: withVar('--hairline'),
        content: withVar('--content'),
        'content-muted': withVar('--content-muted'),
        'content-subtle': withVar('--content-subtle'),
        // Status colours have reserved meanings, see DESIGN.md.
        ok: withVar('--ok'),
        'ok-soft': withVar('--ok-soft'),
        warn: withVar('--warn'),
        'warn-soft': withVar('--warn-soft'),
        risk: withVar('--risk'),
        'risk-soft': withVar('--risk-soft'),
        // Admin dashboard chart marks (validated pair, see index.css).
        'chart-occupied': withVar('--chart-occupied'),
        'chart-reserved': withVar('--chart-reserved'),
      },
      fontFamily: {
        sans: ['Anuphan', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
        display: ['Anuphan', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        micro: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
        small: ['0.875rem', { lineHeight: '1.5' }],
        body: ['1rem', { lineHeight: '1.6' }],
        h3: ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        h2: ['1.375rem', { lineHeight: '1.3', fontWeight: '600' }],
        h1: ['1.875rem', { lineHeight: '1.2', fontWeight: '600' }],
        display: ['clamp(2.75rem, 6vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '22px',
      },
      spacing: {
        // Tailwind's default scale jumps 12 -> 14, so the `h-13` used by the
        // large button compiled to nothing at all and every primary CTA fell
        // back to its content height. DESIGN.md specifies 52px for `lg`.
        13: '3.25rem',
        tabbar: '68px',
        topbar: '64px',
      },
      maxWidth: {
        app: '1180px',
      },
      // Tailwind's opacity scale runs in steps of 5, so the subtle tints this
      // design is built on (`bg-ok/12`, `bg-warn/6`, `bg-brand-500/8` and the
      // rest) compiled to nothing and rendered with no background at all.
      // That silently flattened the status colours on badges, the lot plan's
      // bays, the notification icons and both soft button variants.
      opacity: {
        6: '0.06',
        8: '0.08',
        12: '0.12',
        16: '0.16',
      },
      boxShadow: {
        e1: 'var(--elevation-1)',
        e2: 'var(--elevation-2)',
        e3: 'var(--elevation-3)',
        ring: '0 0 0 3px rgb(var(--brand-500) / 0.25)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(.22,.8,.29,1)',
      },
      transitionDuration: {
        fast: '140ms',
        base: '220ms',
        slow: '420ms',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--risk) / 0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgb(var(--risk) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--risk) / 0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'marquee-slow': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 420ms cubic-bezier(.22,.8,.29,1) both',
        // Urgency only: applied under 5 minutes remaining, never at idle.
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'marquee-slow': 'marquee-slow 38s linear infinite',
      },
    },
  },
  plugins: [],
};
