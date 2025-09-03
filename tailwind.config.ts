// tailwind.config.ts
const config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#0b0f17",
        glass: "rgba(255,255,255,0.06)",
      },
      boxShadow: {
        glow: "0 0 60px rgba(56,189,248,0.15)",
      },
    },
  },
  plugins: [],
} satisfies import("tailwindcss").Config;

export default config;

