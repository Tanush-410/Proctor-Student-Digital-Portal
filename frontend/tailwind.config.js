/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        // Anchored on BMSCE's crest blue (#00519C) at 600 — the shade every
        // primary button/active-nav-state actually shows — so the app reads
        // as genuinely BMS-branded next to the crest, not an unrelated
        // colour scheme that happens to share a page with it.
        brand: {
          50: "#eef6fc",
          100: "#dcedfa",
          200: "#b9daf5",
          300: "#8ec1ec",
          400: "#5a9fdb",
          500: "#2c7cc4",
          600: "#00519c",
          700: "#00427d",
          800: "#00335f",
          900: "#032a4d",
          950: "#041b32",
        },
        crimson: {
          50: "#fef2f2",
          100: "#fde3e2",
          500: "#e30000",
          600: "#c50000",
          700: "#ab0600",
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
