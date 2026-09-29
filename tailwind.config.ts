import type { Config } from "tailwindcss";

// ACOFORM ONE palette. Brand: orange #f09800, gray #6b6d68.
// "graphite" and "aluminium" come from CSS variables (app/globals.css) so the whole app can switch
// between the light theme (default) and dark theme without touching each screen.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix: string, steps: number[]) =>
  Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: scale("graphite", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        aluminium: scale("aluminium", [100, 200, 300, 400]),
        signal: { amber: "#f09800", red: "#dc2626", green: "#16a34a" },
        brand: { orange: "#f09800", "orange-dark": "#c77a00", gray: "#6b6d68" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
