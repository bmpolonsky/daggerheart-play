/** @type {import('tailwindcss').Config} */
module.exports = {
  important: '.tool-viewport--combat',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DH Overpass"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"DH Eveleth"', '"DH Overpass"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        dagger: {
          gold: '#d4af37',
          dark: '#1a1d26',
          panel: '#252936',
          accent: '#3b82f6'
        }
      }
    }
  }
};
