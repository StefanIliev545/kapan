/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./utils/**/*.{js,ts,jsx,tsx}"],
  plugins: [require("daisyui")],
  darkTheme: "kapan",
  darkMode: ["selector", "[data-theme='kapan']"],
  daisyui: {
    themes: [
      // Kapan theme - minimal dark aesthetic (the only theme)
      {
        kapan: {
          "base-100": "#0a0a0a",      // Near-black main bg
          "base-200": "#101010",      // Slightly lighter surfaces
          "base-300": "#1a1a1a",      // Borders/accents
          "base-content": "#e5e5e5",  // Light text
          primary: "#ffffff",         // White as primary (clean CTAs)
          "primary-content": "#0a0a0a",
          secondary: "#71717a",       // Zinc-500 muted
          "secondary-content": "#e5e5e5",
          accent: "#3b82f6",          // Blue accent for highlights
          "accent-content": "#ffffff",
          neutral: "#27272a",
          "neutral-content": "#e5e5e5",
          info: "#38bdf8",
          success: "#4ade80",
          warning: "#fbbf24",
          error: "#f87171",
          "--rounded-btn": "0px",
          ".tooltip": { "--tooltip-tail": "6px" },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "0.8" },
        },
      },
    ],
    // Force kapan as the default
    darkTheme: "kapan",
  },
  theme: {
    container: {
      center: true,
      padding: "0.5rem",
      screens: {
        lg: "1680px",
        xl: "1680px",
        "2xl": "2300px", // 2/3 of 3440px for ultra-wide screens
      },
    },
    extend: {
      boxShadow: { center: "0 0 12px -2px rgb(0 0 0 / 0.05)" },
      animation: {
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "gradient-x": "gradient-x 8s ease infinite",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": { "background-position": "left center" },
          "50%": { "background-position": "right center" },
        },
      },
    },
  },
};
