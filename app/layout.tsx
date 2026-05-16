import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ClientLayout } from "@/components/ClientLayout";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sadhana Challenge",
  description: "26-Day Gamified Spiritual Challenge",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Keep the smooth scroll fix we added earlier
    <html lang="en" data-scroll-behavior="smooth">
      {/* Apply the Inter font to the whole app */}
      <body className={inter.className}>
        {/* 1. Add the Toaster here so error messages are visible everywhere */}
        <Toaster position="top-center" />

        {/* 2. Wrap your app in your Providers and Layouts */}
        <AuthProvider>
          <ClientLayout>
            {children}
          </ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}