import type { Config } from "tailwindcss";

/**
 * Design tokens from local-docs/design_handoff_yieldshield/README.md — the authoritative hi-fi spec.
 * Calm neobank palette: ink primary, protection green (savings), premium indigo (protector),
 * caution amber (paused-for-safety). Money uses tabular figures everywhere.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171A1E",
        brand: { DEFAULT: "#F0B90B", hover: "#DCA909", tint: "#FFF7DC", deep: "#785800" },
        body: "#5B6470",
        muted: "#8A929E",
        faint: "#A6ADB6",
        hairline: "#ECEEF1",
        "hairline-2": "#E8EAED",
        canvas: "#F7F7F2",
        surface: "#FFFFFF",
        subtle: "#F7F7F2",
        "subtle-2": "#EFEEE7",
        green: {
          DEFAULT: "#1F8A5B",
          bright: "#34A56B",
          dark: "#157A52",
          tint: "#E9F5EF",
          "tint-2": "#F1F8F4",
        },
        indigo: {
          DEFAULT: "#3A40A8",
          accent: "#4B53C7",
          tint: "#EEEFFB",
          "tint-2": "#F1F1FB",
          "tint-3": "#F4F4FC",
        },
        amber: {
          DEFAULT: "#B57A1E",
          deep: "#6B5520",
          tint: "#FBF3E2",
          border: "#F0E2C4",
        },
        solana: "#9945FF",
        disabled: "#C2C8D0",
        usdc: { bg: "#F2F5FF", fg: "#2A55E0" },
        jitosol: { bg: "#EAF7F1", fg: "#11A36B" },
        wallet: { phantom: "#5848C7", backpack: "#E33E3F", solflare: "#FFC10A" },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        chip: "11px",
        input: "14px",
        card: "20px",
        hero: "24px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 8px 24px rgba(16,17,20,.07)",
        panel: "0 10px 30px rgba(16,17,20,.06)",
        welcome: "0 30px 70px rgba(16,17,20,.10)",
        modal: "0 40px 90px rgba(16,40,28,.28)",
      },
      letterSpacing: {
        hero: "-0.024em",
        tight2: "-0.02em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.34s cubic-bezier(0.22,0.61,0.36,1) both",
        pop: "pop 0.4s cubic-bezier(0.22,0.61,0.36,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
