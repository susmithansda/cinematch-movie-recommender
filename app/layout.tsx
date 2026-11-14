import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FRAME — Find your next obsession",
  description: "A little less scrolling. A lot more cinema. Discover movies for every mood, explore live releases, and curate your next movie night.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
