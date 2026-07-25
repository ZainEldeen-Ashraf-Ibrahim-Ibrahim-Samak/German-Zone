/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary, #0f766e)', // Teal 700 default
          focus: 'var(--color-primary-focus, #115e59)',
        },
        accent: {
          DEFAULT: 'var(--color-accent, #f59e0b)', // Amber 500 default
          focus: 'var(--color-accent-focus, #d97706)',
        },
        success: '#10b981', // Emerald 500
        danger: '#ef4444',  // Red 500
        warning: '#f59e0b', // Amber 500
        info: '#3b82f6',    // Blue 500
      },
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        sans: ['Inter', 'Cairo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
