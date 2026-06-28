"use client";

export type ChatMode = "icp_lead_gen" | "enrichment" | "simulation";

const MODES: { id: ChatMode; label: string }[] = [
  { id: "icp_lead_gen", label: "ICP and lead generation" },
  { id: "enrichment", label: "Enrichment" },
  { id: "simulation", label: "Simulation" },
];

type ChatModePickerProps = {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  canEnrich: boolean;
  canSimulate: boolean;
};

export function ChatModePicker({
  mode,
  onModeChange,
  canEnrich,
  canSimulate,
}: ChatModePickerProps) {
  function isEnabled(id: ChatMode): boolean {
    if (id === "icp_lead_gen") return true;
    if (id === "enrichment") return canEnrich;
    if (id === "simulation") return canSimulate;
    return false;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {MODES.map(({ id, label }) => {
        const enabled = isEnabled(id);
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onModeChange(id)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
              active
                ? "border-brand-blue bg-brand-blue/15 text-brand-blue-light"
                : enabled
                  ? "border-stone-800 bg-cream-deep text-stone-400 hover:border-stone-700 hover:text-stone-100"
                  : "cursor-not-allowed border-stone-800/60 bg-stone-900/40 text-stone-600"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
