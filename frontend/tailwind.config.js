/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      colors: {
        blueDeep: '#0b3d91',
        blueMid: '#1565c0',
        blueBright: '#1e88e5',
        blueLight: '#bbdefb',
        bluePale: '#e3f2fd',
        gray100: '#f5f7fa',
        gray200: '#eceff1',
        gray300: '#cfd8dc',
        gray500: '#78909c',
        gray700: '#455a64',
        gray900: '#263238',
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
          "primary": "#1565c0",
          "secondary": "#1e88e5",
          "accent": "#0b3d91",
          "neutral": "#263238",
          "base-100": "#ffffff",
          "base-200": "#e3f2fd",
          "base-300": "#cfd8dc",
          "info": "#1e88e5",
          "success": "#2e7d32",
          "warning": "#e65100",
          "error": "#c62828",
        },
      },
    ],
  },
}
