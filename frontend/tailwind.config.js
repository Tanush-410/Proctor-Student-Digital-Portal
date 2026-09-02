/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f1f0ff",
          100: "#e3e1ff",
          200: "#c9c5ff",
          300: "#a79fff",
          400: "#8b7ffb",
          500: "#6a5cf5",
          600: "#5540e8",
          700: "#4732c4",
          800: "#3a299e",
          900: "#302278",
          950: "#1e1550",
        },
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        soft: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 12px rgb(15 23 42 / 0.05)",
        card: "0 1px 3px rgb(15 23 42 / 0.06), 0 8px 24px -8px rgb(15 23 42 / 0.10)",
        popover: "0 12px 32px -8px rgb(15 23 42 / 0.18), 0 4px 12px -4px rgb(15 23 42 / 0.10)",
        glow: "0 0 0 3px rgb(106 92 245 / 0.15)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
