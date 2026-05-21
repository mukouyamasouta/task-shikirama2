import type { Config } from "tailwindcss";
import preset from "@shikirama/tailwind-config/tailwind.preset.js";

const config: Config = {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}"],
};

export default config;
