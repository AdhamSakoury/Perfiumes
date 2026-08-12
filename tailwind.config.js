/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        nubian: {
          gold: '#F5A623',
          brown: '#1B4D4D',
          sand: '#E6D5B8',
          terracotta: '#C65D3B',
          earth: '#5D4E37',
          cream: '#F5F0E6',
          dark: '#0F1717',
          surface: '#162222',
          surface2: '#1D2B2B',
          primary: '#1B4D4D',
          accent: '#F5A623'
        }
      },
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        inter: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
};
