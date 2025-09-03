import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Futurecasting AI — 50-Year Scenarios",
  description:
    "Enter a topic and let the AI predict what could happen in 50 years across markets, politics, and technology.",
  icons: [{ rel: "icon", url: "/favicon.ico" }]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

