import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bbd9fe",
          300: "#8cc0fc",
          400: "#559df8",
          500: "#0070e0", // PayPal vivid blue
          600: "#00457c", // PayPal deep blue
          700: "#003057",
          800: "#002340",
          900: "#00162a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
