import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cinzel = localFont({
  src: [
    { path: "../fonts/Cinzel-500.woff2", weight: "500" },
    { path: "../fonts/Cinzel-600.woff2", weight: "600" },
    { path: "../fonts/Cinzel-700.woff2", weight: "700" },
  ],
  variable: "--font-cinzel",
  display: "swap",
});
const cormorant = localFont({
  src: [
    { path: "../fonts/CormorantGaramond-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/CormorantGaramond-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/CormorantGaramond-500-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});
import { BottomNav } from "@/components/nav/BottomNav";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "TFHealth", template: "%s · TFHealth" },
  description: "Your real life, ranked E through S. A self-improvement RPG.",
  applicationName: "TFHealth",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TFHealth" },
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
    <html lang="en" className={`dark ${cinzel.variable} ${cormorant.variable}`} data-theme="dark">
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
