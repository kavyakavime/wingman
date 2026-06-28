import { AudienceSearch } from "@/components/AudienceSearch";
import { LockedPersonasPanel } from "@/components/LockedPersonasPanel";
import { PingStatus } from "@/components/PingStatus";
import { SwarmTestPanel } from "@/components/SwarmTestPanel";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-4xl space-y-10">
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            YC Hackathon
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Wingman
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Test before you fly. Cold outbound on a digital twin of your real
            audience — before you send a single one.
          </p>
        </div>

        <AudienceSearch />

        <LockedPersonasPanel />

        <SwarmTestPanel />

        <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-500">
            Dev: Convex connection
          </summary>
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <PingStatus />
          </div>
        </details>
      </main>
    </div>
  );
}
