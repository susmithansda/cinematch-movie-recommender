import type { Metadata } from "next";
import "./globals.css";
import "./editorial.css";
import "./cinema-club.css";
import "./discovery-studio.css";

export const metadata: Metadata = {
  title: "FRAME — The Movie Club",
  description: "From Bengal to Mumbai and Los Angeles. Discover Bengali, Hindi and Hollywood films, follow your Taste Compass, and curate your own film festival.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=frame-gold-1", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { url: "/icon-32.png?v=frame-gold-1", type: "image/png", sizes: "32x32" },
      { url: "/frame-mark.svg?v=frame-gold-1", type: "image/svg+xml", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=frame-gold-1",
    apple: [{ url: "/apple-touch-icon.png?v=frame-gold-1", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
