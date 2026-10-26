/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aquaNavy: '#162e43',
        aquaCyan: '#2ca9da',
        aquaPale: '#f0f3f7'
      }
    },
  },
  plugins: [
    require("daisyui")
  ],
  daisyui: {
    themes: [
      {
        aqualicious: {
          "primary": "#162e43",
          "secondary": "#2ca9da",
          "accent": "#0ea5e9",
          "neutral": "#1e293b",
          "base-100": "#ffffff",
          "base-200": "#f0f3f7",
          "base-300": "#e2e8f0",
          "info": "#2ca9da",
          "success": "#22c55e",
          "warning": "#f59e0b",
          "error": "#ef4444",
        },
      },
    ],
  },
}
