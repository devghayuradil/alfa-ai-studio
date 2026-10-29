"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/layout/logo";
import { NavLinks } from "@/components/layout/nav-links";
import { ProviderStatus } from "@/components/layout/provider-status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-background/80 px-4 backdrop-blur-lg lg:hidden">
      <Logo />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Main navigation and provider status</SheetDescription>
          <div className="px-5 pt-5 pb-6">
            <Logo />
          </div>
          <div className="px-3">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <div className="mt-auto p-3">
            <ProviderStatus />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
