/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Layered dark elevation (slightly blue-tinted near-black → raised panels).
        // Steps are intentional and evenly spaced for predictable depth.
        surface: {
          sunken: "#060709", // video letterbox, log insets, deepest wells
          DEFAULT: "#0a0b10", // app base
          raised: "#14161f", // cards, panels
          overlay: "#1d2130", // popovers, inputs, floating chrome
          hover: "#242a3a", // row / interactive hover
        },
        // Brand accent — blue primary, violet secondary for gradients & focus.
        accent: {
          DEFAULT: "#3d7bfd",
          hover: "#2f63db",
          soft: "#6f9bff",
          2: "#8b5cf6", // gradient end (blue → violet)
        },
        // Semantic
        live: { DEFAULT: "#ff3b3b", soft: "#ff6b6b" },
        success: { DEFAULT: "#34d399", soft: "#6ee7b7" },
        warn: { DEFAULT: "#f59e0b", soft: "#fbbf24" },
        danger: { DEFAULT: "#ef4444", soft: "#f87171" },
        // Text ramp (use via text-content-*)
        content: {
          DEFAULT: "#f5f7fa",
          muted: "#a8b0c0",
          faint: "#6b7280",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        // Deliberate display scale with tight tracking baked into line-height.
        "display-xl": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-lg": ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #3d7bfd 0%, #8b5cf6 100%)",
        "accent-gradient-soft":
          "linear-gradient(135deg, rgba(61,123,253,0.18) 0%, rgba(139,92,246,0.18) 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(61,123,253,0.25), 0 8px 30px -12px rgba(61,123,253,0.45)",
        "glow-accent": "0 8px 30px -8px rgba(61,123,253,0.55), 0 2px 8px -2px rgba(139,92,246,0.4)",
        card: "0 4px 24px -8px rgba(0,0,0,0.5)",
        "card-hover": "0 18px 50px -16px rgba(0,0,0,0.7), 0 0 0 1px rgba(61,123,253,0.25)",
        pop: "0 32px 80px -24px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-live": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.85)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out both",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-live": "pulse-live 1.8s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
