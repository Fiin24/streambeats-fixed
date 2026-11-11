/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#FA243C', 2: '#FB2C36' },
        // satu warna aksen: merah merek (sebelumnya hijau + merah bercampur)
        spotify: { DEFAULT: '#FA243C', light: '#FF4458', alt: '#FA243C' },
        gold: '#EDB200',
        electric: '#3080FF',
        panel: '#18181b',
        surface: '#27272a',
        ink: { 950: '#0A0A0A', 900: '#0F0F0F', 850: '#1A1A1A', 800: '#1C1C1E', 700: '#2A2A2A', 600: '#333333' },
        sage: '#81B29A',
        forest: '#0F3A2B',
      },
      keyframes: {
        marquee: { '0%,15%': { transform: 'translateX(0)' }, '85%,100%': { transform: 'translateX(var(--marquee-shift))' } },
        eq: { '0%,100%': { transform: 'scaleY(.3)' }, '50%': { transform: 'scaleY(1)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        fill: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } },
      },
      animation: {
        marquee: 'marquee 9s linear infinite alternate',
        eq: 'eq .9s ease-in-out infinite',
        'spin-slow': 'spin 12s linear infinite',
        'slide-up': 'slide-up .28s cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in .2s ease-out',
        shake: 'shake .35s ease-in-out',
        fill: 'fill 6s linear forwards',
        'rise-in': 'rise-in .45s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
