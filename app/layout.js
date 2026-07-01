import "./globals.css";

export const metadata = {
  title: "Story Forge Dashboard",
  description: "M3.1 minimal workflow dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
