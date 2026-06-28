import type { ReactNode } from "react";
import { WingmanLogo } from "./WingmanLogo";

type AppShellProps = {
  children: ReactNode;
  workspace?: boolean;
};

export function AppShell({ children, workspace = false }: AppShellProps) {
  if (workspace) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-cream">
        <header className="flex h-14 shrink-0 items-center border-b border-stone-800/80 bg-cream-deep/95 px-5 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <WingmanLogo size={26} />
            <span className="font-display shrink-0 text-[17px] font-bold leading-none text-stone-100">
              Wingman
            </span>
            <span className="hidden h-4 w-px shrink-0 bg-stone-700 sm:block" aria-hidden />
            <p className="hidden min-w-0 truncate text-sm font-normal leading-snug tracking-wide text-stone-400 sm:block">
              Test your GTM on digital twins. Only ship what wins.
            </p>
          </div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-cream">
      <header className="sticky top-0 z-50 border-b border-stone-800/80 bg-cream-deep/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <WingmanLogo size={28} />
            <span className="font-display text-[17px] font-bold leading-none text-stone-100">
              Wingman
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">{children}</main>

      <footer className="border-t border-stone-800/80 py-8 text-center text-xs text-stone-500">
        Wingman — GTM testing on digital twins
      </footer>
    </div>
  );
}
