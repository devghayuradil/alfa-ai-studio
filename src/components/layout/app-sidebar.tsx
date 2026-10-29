import { Logo } from "@/components/layout/logo";
import { NavLinks } from "@/components/layout/nav-links";
import { ProviderStatus } from "@/components/layout/provider-status";

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur lg:flex">
      <div className="px-5 pt-5 pb-6">
        <Logo />
      </div>
      <div className="px-3">
        <div className="px-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">Studio</div>
        <NavLinks />
      </div>
      <div className="mt-auto p-3">
        <ProviderStatus />
        <p className="px-1 pt-3 text-[10.5px] leading-relaxed text-muted-foreground/60">
          Personal studio · Seedance via BytePlus ModelArk
        </p>
      </div>
    </aside>
  );
}
