/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        accent: {
          cyan: 'var(--accent-cyan)',
          violet: 'var(--accent-violet)',
          emerald: 'var(--accent-emerald)',
        },
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
