import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import "./globals.css";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppConfigProvider } from "@/hooks/use-app-config";

export const metadata: Metadata = {
  title: {
    default: "Alfa AI Studio",
    template: "%s · Alfa AI Studio",
  },
  description: "Personal AI video generation studio powered by Seedance.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full font-sans">
        <AppConfigProvider>
          <TooltipProvider>
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
              <div className="absolute -top-48 left-1/3 size-[640px] rounded-full bg-brand-from/[0.09] blur-[140px]" />
              <div className="absolute top-1/3 -right-40 size-[520px] rounded-full bg-brand-via/[0.06] blur-[140px]" />
            </div>
            <AppSidebar />
            <div className="flex min-h-screen flex-col lg:pl-64">
              <MobileHeader />
              <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
            </div>
          </TooltipProvider>
        </AppConfigProvider>
        <Toaster />
      </body>
    </html>
  );
}
