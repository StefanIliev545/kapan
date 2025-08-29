/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./utils/**/*.{js,ts,jsx,tsx}"],
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
          success: "#3B82F6",
          warning: "#FBBF24",
          error: "#F97316",
          "--rounded-btn": "0.375rem",
          ".tooltip": { "--tooltip-tail": "6px" },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "0.8" },
        },
      },
      // Custom synthwave theme derived from the refreshed dark palette
      {
        synthwave: {
          // Muted indigo backdrop tones
          "base-100": "#1E1E2E", // main background
          "base-200": "#2A2A3C", // slightly lighter for surfaces
          "base-300": "#3A3A4F", // even lighter accents
          "base-content": "#E6E6EF", // light text for contrast

          // Cool blue primary elements
          primary: "#7AA2F7",
          "primary-content": "#1E1E2E",

          // Subtle purple secondary highlights
          secondary: "#AD8EE6",
          "secondary-content": "#1E1E2E",

          // Pastel pink accents for focus
          accent: "#F4B8E4",
          "accent-content": "#1E1E2E",

          // Slate neutrals for borders and UI chrome
          neutral: "#414558",
          "neutral-content": "#E6E6EF",

          // Supporting status colors
          info: "#89DDFF",
          success: "#A6E3A1",
          warning: "#F9E2AF",
          error: "#F28FAD",

          "--rounded-btn": "0.375rem",
          ".tooltip": {
            "--tooltip-tail": "6px",
            "--tooltip-color": "oklch(var(--p))",
          },
          ".link": { textUnderlineOffset: "2px" },
          ".link:hover": { opacity: "0.8" },
        },
      },
      // Additional DaisyUI themes for more choices
      "emerald",
      "dark",
      "retro",
      "forest",
      "valentine",
    ],
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
