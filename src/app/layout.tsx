import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import "@/styles/globals.css";
import "@/styles/workspace.css";

export const metadata: Metadata = {
  title: "下一步 · 个人决策推演室",
  description: "把重要的选择，变成可以迈出的下一步。",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            <Compass size={26} />
            <span>
              下一步<small>个人决策推演室</small>
            </span>
          </Link>
          <span className="header-note">慢一点想清楚，再向前一步。</span>
          <Link className="nav-link" href="/">
            我的决策
          </Link>
        </header>
        <main>{children}</main>
        <footer>
          情境用于探索，不代表未来预测。内容保存在当前浏览器会话下；清除 Cookie 后无法找回。
        </footer>
      </body>
    </html>
  );
}
