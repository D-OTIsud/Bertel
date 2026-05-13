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
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
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
        /* Design scale (explicit px for Explorer / shell utilities) */
        shell: '10px',
        shellMd: '14px',
        shellLg: '20px',
        shellXl: '28px',
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
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
