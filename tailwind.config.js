/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        "ink-700": "#2b3038",
        muted: "#596171",
        paper: "#f7f5ef",
        "paper-50": "#fbfaf7",
        surface: "#ffffff",
        line: "#ded8cc",
        "line-soft": "#ebe6dc",
        forest: "#1f6b57",
        "forest-soft": "#e9f7ef",
        amber: "#b7791f",
        "amber-soft": "#fff7e6",
        coral: "#c65f46",
        "coral-soft": "#fff1ed",
        blue: "#2f6feb",
        "blue-soft": "#eaf2ff",
        "gray-soft": "#f3f4f6",
      },
      borderRadius: {
        card: "8px",
      },
    },
  },
  plugins: [],
};
