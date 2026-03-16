import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "#f1f3f6",
        slate: {
          50: "#eceff3",
          100: "#dde3e9",
        },
        accent: {
          50: "#efeff1",
          100: "#dfdfe3",
          300: "#b3b4bc",
          400: "#92949f",
          500: "#6f7280",
          600: "#575a67",
        },
      },
      boxShadow: {
        panel: "0 12px 40px -16px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
