import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { getSetting } from "@/db/data/settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bonsai",
  description: "AI-powered developer workspace",
  icons: {
    icon: [
      { url: "/bonsai-os-logo-l.png", media: "(prefers-color-scheme: dark)" },
      { url: "/bonsai-os-logo-d.png", media: "(prefers-color-scheme: light)" },
    ],
    apple: "/bonsai-os-logo-d.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userName = await getSetting("user_name");

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex h-screen overflow-hidden">
          <Sidebar userName={userName ?? undefined} />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
