import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { OfflineStatusBanner } from "@/components/offline-status-banner";
import { ServiceWorkerRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CallDesk",
  description: "Mobile-first personal cold calling CRM",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CallDesk",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans text-base pb-20 selection:bg-emerald-500 selection:text-zinc-950">
        <ServiceWorkerRegister />
        <OfflineStatusBanner />
        <div className="flex-1 flex flex-col max-w-md mx-auto w-full min-h-screen">
          {children}
        </div>
        <BottomTabBar />
      </body>
    </html>
  );
}
