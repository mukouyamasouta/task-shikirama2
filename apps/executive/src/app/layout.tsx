import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "シキラマ — 役員",
  description: "シキラマ評価管理システム / EXECUTIVE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="max-w-[440px] md:max-w-[720px] mx-auto min-h-screen relative">
          {children}
        </div>
      </body>
    </html>
  );
}
