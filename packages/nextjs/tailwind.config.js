/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [require("daisyui")],
  darkTheme: "dark",
  darkMode: ["selector", "[data-theme='dark']"],
  daisyui: {
    themes: [
      // Light theme remains unchanged
      {
        light: {
          primary: "#3B82F6",
          "primary-content": "#ffffff",
          secondary: "#E5E7EB",
          "secondary-content": "#1F2937",
          accent: "#10B981",
          "accent-content": "#ffffff",
          neutral: "#1F2937",
          "neutral-content": "#ffffff",
          "base-100": "#ffffff",
          "base-200": "#F1F5F9",
          "base-300": "#E2E8F0",
          "base-content": "#1F2937",
          info: "#3ABFF8",
          success: "#34D399",
          warning: "#FBBF24",
          error: "#FB7185",
          "--rounded-btn": "0.375rem",
          ".tooltip": { "--tooltip-tail": "6px" },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "0.8" },
        },
      },
      // Updated dark theme
      {
        dark: {
          // A near‑black base for a striking backdrop:
          "base-100": "#0D0D0D", // main background
          "base-200": "#171717", // slightly lighter for surfaces
          "base-300": "#1F1F1F", // even lighter accents
          "base-content": "#F9FBFF", // light text for contrast

          // Primary areas use a deep charcoal:
          primary: "#1C1C1C",
          "primary-content": "#F9FBFF",

          // Secondary elements get a warm, dark bronze tone to break up the monotony:
          secondary: "#2E2B2F",
          "secondary-content": "#F9FBFF",

          // A bold gold accent for that crypto luxury vibe:
          accent: "#F9A826",
          "accent-content": "#1F1F1F",

          // Neutral elements match the primary for consistency:
          neutral: "#1C1C1C",
          "neutral-content": "#F9FBFF",

          // Retain some dynamic colors:
          info: "#0FF0FC",
          success: "#34D399",
          warning: "#FFCF72",
          error: "#FF8863",

          "--rounded-btn": "0.375rem",
          ".tooltip": {
            "--tooltip-tail": "6px",
            "--tooltip-color": "oklch(var(--p))",
          },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "0.8" },
        },
      },
    ],
  },
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        lg: "1024px",
        xl: "1280px",
        "2xl": "1440px", // your maximum width for ultra-wide screens
      },
    },
    extend: {
      boxShadow: { center: "0 0 12px -2px rgb(0 0 0 / 0.05)" },
      animation: { "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite" },
    },
  },
};
