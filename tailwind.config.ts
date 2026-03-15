import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#edf6ff",
          100: "#d9ebff",
          300: "#8cc2ff",
          400: "#64adff",
          500: "#3c98ff",
          600: "#1f7ae0"
        }
      },
      boxShadow: {
        panel: "0 12px 40px -16px rgba(15, 23, 42, 0.25)"
      }
    }
  },
  plugins: []
};

export default config;
