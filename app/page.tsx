import { PingStatus } from "@/components/PingStatus";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-lg space-y-8">
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
        <PingStatus />
        <p className="text-center text-xs text-zinc-400">
          Skeleton deployed · Fiber · Orange Slice · Swarm · Graph coming next
        </p>
      </main>
    </div>
  );
}
