import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MandateProvider } from "@/lib/state";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mandate — Permission Slip for AI Agents that Spend Money",
  description:
    "AI agents shop for you; Mandate checks every purchase against signed rules before PayPal captures payment, leaving tamper-proof receipts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <MandateProvider>
          <div className="flex min-h-screen bg-slate-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Header />
              <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
                {children}
              </main>
            </div>
          </div>
        </MandateProvider>
      </body>
    </html>
  );
}
