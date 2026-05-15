import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
      },
      keyframes: {
        slide: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        slide: 'slide 1.8s linear infinite',
      },
      colors: {
        surface: {
          DEFAULT: '#FAFAF8',
          elevated: '#FFFFFF',
        },
        ink: {
          primary: '#1A1A1A',
          secondary: '#6B6B6B',
          muted: '#A0A0A0',
        },
        sage: {
          DEFAULT: '#4A7C59',
          light: '#EBF3ED',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
