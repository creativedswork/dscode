/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        warm: {
          bg: "var(--color-bg)",
          surface: "var(--color-surface)",
          "surface-hover": "var(--color-surface-hover)",
          border: "var(--color-border)",
          text: "var(--color-text)",
          muted: "var(--color-text-muted)",
          accent: "var(--color-accent)",
          "accent-hover": "var(--color-accent-hover)",
          success: "var(--color-success)",
          "success-text": "var(--color-success-text)",
          error: "var(--color-error)",
          "error-text": "var(--color-error-text)",
          warning: "var(--color-warning)",
          "warning-text": "var(--color-warning-text)",
          "user-bubble": "var(--color-user-bubble)",
          "user-bubble-text": "var(--color-user-bubble-text)",
        },
      },
      fontFamily: {
        mono: ["Geist Mono", "JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Geist Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "8px",
        bubble: "12px",
        btn: "6px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-in": "slide-in 300ms ease-out forwards",
      },
    },
  },
  plugins: [],
};
