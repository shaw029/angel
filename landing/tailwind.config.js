/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        surface: '#F8F7F5',
        sage: {
          DEFAULT: '#4A7C59',
          light:   '#EBF3ED',
          muted:   '#7FA88A',
        },
        ink: {
          primary:   '#1A1A1A',
          secondary: '#4A4A4A',
          muted:     '#6B7280',
          faint:     '#9CA3AF',
        },
        border: {
          DEFAULT: '#E5E2DC',
          dark:    '#2A2926',
        },
        dark: {
          bg:   '#111110',
          card: '#1A1917',
        },
      },
      animation: {
        'float-slow':  'floatSlow 18s ease-in-out infinite',
        'float-slow2': 'floatSlow 24s ease-in-out infinite reverse',
        'fade-up':     'fadeUp 0.7s ease-out forwards',
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%':      { transform: 'translate(20px, -15px) scale(1.04)' },
          '66%':      { transform: 'translate(-10px, 10px) scale(0.97)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
