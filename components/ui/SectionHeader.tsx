import type { ReactNode } from "react";

type SectionHeaderProps = {
  step?: number;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({
  step,
  title,
  description,
  action,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-4">
        {step != null ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue/15 text-sm font-semibold text-brand-blue-light">
            {step}
          </div>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-stone-100">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-stone-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
