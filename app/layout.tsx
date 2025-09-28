import "@/styles/globals.css";

import { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "../components/providers";
import { ChatProvider } from "@/lib/chat-context";
import { Analytics } from "@vercel/analytics/react";

// Using local fallback fonts since Google Fonts is not accessible
const fontVariables = "font-sans";

export const metadata: Metadata = {
  title: "Surf - E2B Computer Use Agent",
  description:
    "AI agent that interacts with a virtual desktop environment through natural language instructions",
  keywords: [
    "AI",
    "desktop",
    "automation",
    "E2B",
    "OpenAI",
    "virtual desktop",
    "sandbox",
  ],
  authors: [{ name: "E2B", url: "https://e2b.dev" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={fontVariables}
        suppressHydrationWarning
      >
        <Providers>
          <ChatProvider>
            <Toaster position="top-center" richColors />
            {children}
            <Analytics />
          </ChatProvider>
        </Providers>
      </body>
    </html>
  );
}
