import { Geist, Geist_Mono } from "next/font/google";
import AppLanguageProvider from "@/components/AppLanguageProvider";
import HrThemeProvider from "@/components/HrThemeProvider";
import "./globals.css";
import "./hr-themes.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "秋奈 × 深夜 HR",
  description: "秋奈電競與深夜不關燈員工 HR",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <HrThemeProvider>{children}</HrThemeProvider>
        <AppLanguageProvider />
      </body>
    </html>
  );
}
