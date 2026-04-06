import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ConversationProvider } from "@/components/conversation-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "えみは総合歯科 大阪梅田院 AI受付デモ",
  description:
    "えみは総合歯科 大阪梅田院向けのAI受付デモ。Web会話、実電話、仮受付ドラフト、アポツール投入用の確認フローに対応。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ConversationProvider>{children}</ConversationProvider>
      </body>
    </html>
  );
}
