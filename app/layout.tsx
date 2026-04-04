import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ConversationProvider } from "@/components/conversation-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "歯科一次受付AI デモ",
  description:
    "ElevenLabs Agents と Next.js を使った歯科一次受付AIデモ。WebRTC 会話と実電話会話のメモ回収に対応。",
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
