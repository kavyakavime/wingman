import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_ICP } from "@/lib/mockLeads";
import type { ChatMode } from "@/components/workspace/ChatModePicker";

const STORAGE_KEY = "wingman:workspace-session";
const VERSION = 1;

type StoredOutreachChannel = "email" | "physical_mail" | "linkedin_dm";

export type StoredChatMessage =
  | { id: string; role: "user" | "assistant"; kind: "text"; content: string }
  | { id: string; role: "assistant"; kind: "test_type_picker" }
  | { id: string; role: "assistant"; kind: "channel_picker" }
  | {
      id: string;
      role: "assistant";
      kind: "swarm_results";
      variant: "baseline" | "after_rewrite";
      label: string;
      summary: string;
      scores: unknown[];
      overall: number | null;
      beforeScores?: unknown[] | null;
    }
  | { id: string; role: "assistant"; kind: "rewrite_ready" };

export type WorkspaceSession = {
  v: typeof VERSION;
  activeRunId: string | null;
  icp: string;
  selectedLeadIds: string[];
  leftTab: "leads" | "swarm" | "rewrites";
  simulationDraft: string;
  enrichPopupDismissed: boolean;
  chat: {
    runId: string | null;
    messages: StoredChatMessage[];
    chatMode: ChatMode;
    draftMessage: string;
    activeDraft: string;
    channel: StoredOutreachChannel | null;
    leadsLoadedSent: boolean;
    enrichCompleteSent: boolean;
    baselineResultsSent: boolean;
    retestResultsSent: boolean;
  };
};

export type WorkspaceHydration = {
  icp: string;
  activeRunId: Id<"audienceRuns"> | null;
  selectedLeadIds: Id<"leads">[];
  leftTab: "leads" | "swarm" | "rewrites";
  simulationDraft: string;
  enrichPopupDismissed: boolean;
  chat: WorkspaceSession["chat"];
};

function defaultSession(): WorkspaceSession {
  return {
    v: VERSION,
    activeRunId: null,
    icp: DEFAULT_ICP,
    selectedLeadIds: [],
    leftTab: "leads",
    simulationDraft: "",
    enrichPopupDismissed: false,
    chat: {
      runId: null,
      messages: [],
      chatMode: "icp_lead_gen",
      draftMessage: "",
      activeDraft: "",
      channel: null,
      leadsLoadedSent: false,
      enrichCompleteSent: false,
      baselineResultsSent: false,
      retestResultsSent: false,
    },
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadWorkspaceSession(): WorkspaceSession {
  if (!isBrowser()) return defaultSession();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSession();
    const parsed = JSON.parse(raw) as Partial<WorkspaceSession>;
    if (parsed.v !== VERSION) return defaultSession();
    return {
      ...defaultSession(),
      ...parsed,
      chat: { ...defaultSession().chat, ...parsed.chat },
    };
  } catch {
    return defaultSession();
  }
}

export function saveWorkspaceSession(session: WorkspaceSession): void {
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function patchWorkspaceSession(patch: Partial<Omit<WorkspaceSession, "chat">> & {
  chat?: Partial<WorkspaceSession["chat"]>;
}): void {
  const current = loadWorkspaceSession();
  saveWorkspaceSession({
    ...current,
    ...patch,
    chat: patch.chat ? { ...current.chat, ...patch.chat } : current.chat,
  });
}

export function defaultWorkspaceHydration(): WorkspaceHydration {
  const session = defaultSession();
  return {
    icp: session.icp,
    activeRunId: null,
    selectedLeadIds: [],
    leftTab: session.leftTab,
    simulationDraft: session.simulationDraft,
    enrichPopupDismissed: session.enrichPopupDismissed,
    chat: session.chat,
  };
}

export function hydrateWorkspace(): WorkspaceHydration {
  const session = loadWorkspaceSession();
  return {
    icp: session.icp || DEFAULT_ICP,
    activeRunId: session.activeRunId as Id<"audienceRuns"> | null,
    selectedLeadIds: session.selectedLeadIds as Id<"leads">[],
    leftTab: session.leftTab,
    simulationDraft: session.simulationDraft,
    enrichPopupDismissed: session.enrichPopupDismissed,
    chat: session.chat,
  };
}

export function clearWorkspaceSession(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}
