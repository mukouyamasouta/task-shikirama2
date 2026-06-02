import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:      "#0F0E17",
        bg2:     "#1A1828",
        bg3:     "#232136",
        surface: "#2A2740",
        text:    "#E8E6F0",
        text2:   "#9B98B0",
        text3:   "#6B6880",
        accent:  "#7B6EF6",
        accent2: "#A99BFF",
        accent3: "rgba(123,110,246,0.15)",
        green:   "#4ECBA0",
        green2:  "rgba(78,203,160,0.15)",
        amber:   "#F5A623",
        amber2:  "rgba(245,166,35,0.15)",
        coral:   "#F76D6D",
        coral2:  "rgba(247,109,109,0.15)",
        pink:    "#E879A0",
        pink2:   "rgba(232,121,160,0.15)",
        cyan:    "#4EC9D6",
        cyan2:   "rgba(78,201,214,0.15)",
        border1: "rgba(255,255,255,0.08)",
        border2: "rgba(255,255,255,0.14)",
      },
      fontFamily: {
        ja:   ['"Zen Kaku Gothic New"', "-apple-system", '"Hiragino Sans"', "sans-serif"],
        mono: ['"DM Mono"', "ui-monospace", '"SF Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
