import type { ReactNode } from "react";

type PanelProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Panel({ children, className = "", id }: PanelProps) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-stone-800 bg-cream-deep shadow-[0_1px_3px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelBody({ children, className = "" }: PanelProps) {
  return <div className={`p-6 sm:p-8 ${className}`}>{children}</div>;
}

export function PanelDivider() {
  return <div className="border-t border-stone-800" />;
}
