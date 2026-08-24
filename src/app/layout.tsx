import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { FarmProvider } from "@/store/farm-store";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Farm Return",
  description:
    "Smarter decisions, stronger returns — Irish farm management and financial intelligence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-fr-surface-alt text-fr-ink-900">
        <FarmProvider>
          <AppShell>{children}</AppShell>
        </FarmProvider>
      </body>
    </html>
  );
}
