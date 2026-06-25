import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      spacing: {
        sidebar: '64px',
        rail: '280px',
      },
      colors: {
        /* P2 fix: these pointed at undefined --bg-base/--bg-surface/--bg-elevated tokens,
           so `.bg-surface` resolved to transparent (inputs rendered see-through). */
        base: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--panel-strong)',
        bg: 'var(--bg)',
        bgTint: 'var(--bg-tint)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        lineSoft: 'var(--line-soft)',
        lineStrong: 'var(--line-strong)',
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        teal: {
          DEFAULT: 'var(--teal)',
          2: '#0d4f4e',
          soft: 'var(--teal-soft)',
          tint: 'var(--teal-tint)',
        },
        orange: {
          DEFAULT: 'var(--accent-brand)',
          2: 'var(--accent-brand-strong)',
          soft: 'var(--orange-soft)',
        },
        brand: {
          green: 'var(--brand-green)',
          greenSoft: 'var(--brand-green-soft)',
          red: 'var(--brand-red)',
          warn: 'var(--brand-warn)',
        },
        accent: {
          cyan: 'var(--accent-cyan)',
          violet: 'var(--accent-violet)',
          emerald: 'var(--accent-emerald)',
        },
        /* Semantic families (RGPD refonte §p2) — bg/border/ink/accent per tone. */
        info: {
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
          ink: 'var(--info-ink)',
          accent: 'var(--info-accent)',
        },
        danger: {
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
          ink: 'var(--danger-ink)',
          strong: 'var(--danger-strong)',
        },
        warn: {
          bg: 'var(--warn-bg)',
          border: 'var(--warn-border)',
          ink: 'var(--warn-ink)',
          strong: 'var(--warn-strong)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
      },
      borderRadius: {
        /* shadcn: lg still tracks --radius (14px via theme.ts) */
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        /* Design scale (explicit px for Explorer / shell utilities) — crisp */
        shell: '6px',
        shellMd: '8px',
        shellLg: '10px',
        shellXl: '12px',
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
      },
      boxShadow: {
        s: 'var(--shadow-s)',
        m: 'var(--shadow-m)',
        l: 'var(--shadow-l)',
      },
      fontFamily: {
        // audit S5 : pointe vers les variables next/font (cf. src/app/layout.tsx)
        // au lieu des littéraux Google Fonts.
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
