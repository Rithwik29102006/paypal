import type { Config } from "tailwindcss";

/**
 * Mandate design tokens.
 * PayPal's palette (deep navy, vivid blue, light sky) carries the payment side;
 * three status colours carry Mandate's decisions: go (paid/allowed),
 * ask (needs Anita), stop (blocked).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#001C64", 700: "#00144A", 900: "#000C2E" },
        pp: { DEFAULT: "#0070E0", 600: "#005EC2", 50: "#EAF3FF" },
        sky: { DEFAULT: "#60CDFF", 200: "#BFEAFF" },
        mist: "#EEF3FB",
        ink: { DEFAULT: "#0A1633", 600: "#3A4766", 400: "#6B7894" },
        line: "#D8E1EF",
        go: { DEFAULT: "#0E9F6E", 50: "#E7F7F0" },
        ask: { DEFAULT: "#C77A0E", 50: "#FDF3E2" },
        stop: { DEFAULT: "#D93B54", 50: "#FDECEF" },
        // kept for the demo store pages
        brand: { 50: "#eef6ff", 100: "#d9eaff", 200: "#bbd9fe", 300: "#8cc0fc", 400: "#559df8", 500: "#0070e0", 600: "#00457c", 700: "#003057", 800: "#002340", 900: "#00162a" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // modular scale (1.25) from 16px
        "2xs": ["0.75rem", { lineHeight: "1.1rem" }],
        hero: ["clamp(2.4rem, 5vw, 3.9rem)", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
      },
      keyframes: {
        orb: { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        stamp: { "0%": { opacity: "0", transform: "scale(1.25) rotate(-8deg)" }, "100%": { opacity: "1", transform: "scale(1) rotate(-4deg)" } },
      },
      animation: {
        orb: "orb 6s linear infinite",
        "orb-fast": "orb 1.4s linear infinite",
        rise: "rise 260ms ease-out both",
        stamp: "stamp 320ms cubic-bezier(.2,1.4,.4,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
