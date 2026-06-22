import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SUIKA X — Cognitive Operating System",
  description:
    "SUIKA X: a cognitive operating system — knowledge fabric, agent runtime, model router, memory, and observability in one live control plane.",
  keywords: ["SUIKA X", "cognitive OS", "agents", "knowledge graph", "LLM router"],
  authors: [{ name: "SUIKA X" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
        <SonnerToaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "oklch(0.205 0.014 162)",
              border: "1px solid oklch(0.78 0.16 158 / 0.3)",
              color: "oklch(0.97 0.01 140)",
            },
          }}
        />
      </body>
    </html>
  );
}
