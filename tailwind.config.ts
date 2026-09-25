import type { Config } from "tailwindcss";

// ACOFORM ONE palette. Brand: orange #f09800, gray #6b6d68.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          50: "#f6f6f5", 100: "#e8e8e6", 200: "#d1d1ce", 300: "#b0b1ad", 400: "#8d8e8a",
          500: "#6b6d68", 600: "#555752", 700: "#3f413d", 800: "#2a2c29", 900: "#1c1d1b", 950: "#121311",
        },
        aluminium: { 100: "#f2f3f4", 200: "#e3e5e8", 300: "#cfd3d8", 400: "#aeb4bb" },
        signal: { amber: "#f09800", red: "#ef4444", green: "#22c55e" },
        brand: { orange: "#f09800", gray: "#6b6d68" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
