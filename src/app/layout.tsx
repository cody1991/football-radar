import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Radar · 今晚值得看",
  description: "按球队排名 + 传统德比筛选今天值得看的足球比赛",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
