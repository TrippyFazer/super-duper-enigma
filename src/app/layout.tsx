import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/nav/BottomNav";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "Ascend", template: "%s · Ascend" },
  description: "Your real life, ranked E through S. A self-improvement RPG.",
  applicationName: "Ascend",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Ascend" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body>
        <FeedbackProvider>
          <main className="min-h-dvh">{children}</main>
          <BottomNav />
        </FeedbackProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
