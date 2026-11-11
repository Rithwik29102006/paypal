import type { Metadata } from "next";
import { Bricolage_Grotesque, Onest } from "next/font/google";
import "./globals.css";
import { MandateProvider } from "@/lib/state";
import { TopBar } from "@/components/TopBar";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Onest({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Mandate: a permission slip for AI agents that spend money",
  description:
    "An AI agent shops for you; Mandate checks every purchase against your signed rules before PayPal moves any money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <MandateProvider>
          <TopBar />
          <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10">{children}</main>
        </MandateProvider>
      </body>
    </html>
  );
}
