import type { Config } from "tailwindcss";

// CreatorFix brand tokens.
// Deep ink navy (trust, tech) + a signal-teal accent (distinct from generic
// SaaS blue/purple and from Claude's own terracotta) + warm neutral paper
// for content surfaces. Deliberately avoids the cream+terracotta and
// black+acid-green defaults.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1220",
          900: "#101B2E",
          800: "#182842",
          700: "#22375A",
        },
        signal: {
          500: "#12B6A0",
          600: "#0E9A87",
          400: "#3FD1BC",
        },
        paper: {
          50: "#F7F8FA",
          100: "#EFF2F6",
        },
        alert: {
          500: "#E0562F",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};
export default config;
