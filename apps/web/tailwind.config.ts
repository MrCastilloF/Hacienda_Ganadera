/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del proyecto (docs/01 §6.5): verde oscuro, tierra, gris neutro.
        campo: {
          950: '#0b1f16',
          900: '#123024',
          800: '#1b4633',
          700: '#256a49',
          500: '#3f8f63',
          100: '#e6f0ea',
        },
        tierra: {
          500: '#a9714b',
          100: '#f4e9e1',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
