import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/lib/auth";
import { SearchProvider } from "@/lib/search-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StreamHub",
  description: "Authorized streaming dashboard",
  icons: { icon: "/images/favicon.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          <SearchProvider>
            <ToastProvider>
              <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1">{children}</main>
              </div>
            </ToastProvider>
          </SearchProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
