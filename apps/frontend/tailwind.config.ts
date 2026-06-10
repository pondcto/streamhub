import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1117",
          raised: "#1a1d27",
          overlay: "#252936",
        },
        accent: {
          DEFAULT: "#e50914",
          hover: "#f6121d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
