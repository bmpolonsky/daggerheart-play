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
          gold: 'var(--dh-gold-500, #d8ad53)',
          dark: 'var(--dh-ink-900, #0d1218)',
          panel: 'var(--dh-glass-strong, rgba(9, 11, 15, 0.84))',
          accent: 'var(--dh-blue-500, #5b9fda)'
        }
      }
    }
  }
};
