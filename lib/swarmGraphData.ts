import type { Id } from "../convex/_generated/dataModel";
import {
  LOCKED_SEGMENT_ASSIGNMENTS,
  SEGMENT_GRAPH_COLORS,
  SEGMENT_ORDER,
  type PersonaSegment,
} from "./segments";
import { shortPersonName } from "./swarmGraphScene";

export type SwarmSentiment = "positive" | "neutral" | "objecting";

export type SwarmReactionRow = {
  leadId: Id<"leads">;
  segment?: PersonaSegment;
  sentiment: SwarmSentiment;
  reasoningText: string;
  citedSignal: string;
  personName: string;
  round?: 1 | 2 | 3;
};

export type GraphPersonaRow = {
  _id: Id<"leads">;
  personName?: string;
  segment?: PersonaSegment;
};

export type AmbientLeadRow = {
  _id: Id<"leads">;
  personName?: string;
};

/** @deprecated use GraphPersonaRow */
export type LockedPersonaRow = GraphPersonaRow;

export type SwarmGraphNode = {
  id: string;
  label: string;
  shortLabel: string;
  segment: PersonaSegment;
  sentiment?: SwarmSentiment;
  reasoningText?: string;
  citedSignal?: string;
  round?: 1 | 2 | 3;
  isActive: boolean;
  /** Central outbound email — fixed at origin. */
  isEmailHub?: boolean;
  /** Visual-only population node — not in swarm, no labels/interaction. */
  isAmbient?: boolean;
  /** Screen-space label nudge so cluster-mate names don't overlap. */
  labelOffsetX?: number;
  labelOffsetY?: number;
  color: string;
  val: number;
  emissiveIntensity: number;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};

export type SwarmGraphLink = {
  source: string;
  target: string;
  color: string;
  /** Spoke from the central email hub to a lead. */
  isHubLink?: boolean;
  /** Flowing particles when round-2 peer influence is active. */
  peerActivated: boolean;
  isCrossSegment?: boolean;
};

export type SwarmGraphData = {
  nodes: SwarmGraphNode[];
  links: SwarmGraphLink[];
};

export const IDLE_GRAPH_COLOR = "#c9c0a0";
export const IDLE_NODE_VAL = 4;
export const IDLE_EMISSIVE = 0.28;

export const AMBIENT_NODE_COLOR = "#c8c4d4";
export const AMBIENT_NODE_VAL = 1.2;
export const AMBIENT_EMISSIVE = 0.18;

/** Deep void — reference aesthetic. */
export const SWARM_GRAPH_BG = "#040408";
export const SWARM_GRAPH_BG_NUM = 0x040408;

export const EMAIL_HUB_NODE_ID = "__swarm_email_hub__";
export const EMAIL_HUB_COLOR = "#f5f0e8";
export const EMAIL_HUB_VAL = 6;
export const EMAIL_HUB_EMISSIVE = 0.72;
export const EMAIL_HUB_LINK_COLOR = "#d4cfc4";

/** Sentiment palette — green (positive) / yellow (neutral) / red (objecting). */
export const SENTIMENT_GRAPH_COLORS: Record<SwarmSentiment, string> = {
  positive: "#34d399",
  neutral: "#facc15",
  objecting: "#f87171",
};

function leadOrbitPosition(
  index: number,
  total: number,
): { x: number; y: number; z: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const radius = 34 + Math.sqrt(total) * 2.2;
  const wobble = (index % 3) * 2 - 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.52 + wobble,
    z: Math.sin(angle * 2) * 6,
  };
}

function buildEmailHubNode(draftMessage?: string): SwarmGraphNode {
  const trimmed = draftMessage?.trim() ?? "";
  const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/im);
  const subject = subjectMatch?.[1]?.trim();
  const label = subject
    ? `Email — ${subject.slice(0, 48)}${subject.length > 48 ? "…" : ""}`
    : trimmed
      ? `Email — ${trimmed.slice(0, 48)}${trimmed.length > 48 ? "…" : ""}`
      : "Outbound email";

  return {
    id: EMAIL_HUB_NODE_ID,
    label,
    shortLabel: "Email",
    segment: "scaled",
    isActive: true,
    isEmailHub: true,
    color: EMAIL_HUB_COLOR,
    val: EMAIL_HUB_VAL,
    emissiveIntensity: EMAIL_HUB_EMISSIVE,
    x: 0,
    y: 0,
    z: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    labelOffsetY: 16,
  };
}

function emailHubLinkColor(node: SwarmGraphNode): string {
  if (node.sentiment) return SENTIMENT_GRAPH_COLORS[node.sentiment];
  return EMAIL_HUB_LINK_COLOR;
}

function ambientNodePosition(
  leadId: string,
  index: number,
): { x: number; y: number; z: number } {
  const hash = hashLeadId(leadId);
  const clusterIdx = index % SEGMENT_ORDER.length;
  const slot = Math.floor(index / SEGMENT_ORDER.length);
  const anchorAngle = (clusterIdx / SEGMENT_ORDER.length) * Math.PI * 2 - Math.PI / 2;
  const lobeDistance = 92 + (hash % 22) + (slot % 3) * 8;
  const lobeCenter = {
    x: Math.cos(anchorAngle) * lobeDistance,
    y: Math.sin(anchorAngle) * lobeDistance * 0.72,
    z: ((hash >> 4) % 18) - 9,
  };

  const localAngle =
    anchorAngle + Math.PI / 2 + slot * 0.58 + ((hash % 360) * Math.PI) / 180 * 0.32;
  const localRadius = 16 + (hash % 16) + (slot % 5) * 5;

  return {
    x: lobeCenter.x + Math.cos(localAngle) * localRadius,
    y: lobeCenter.y + Math.sin(localAngle) * localRadius * 0.55,
    z: lobeCenter.z + Math.sin(localAngle * 1.1) * localRadius * 0.28,
  };
}

function hashLeadId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildAmbientNodes(
  ambientLeads: AmbientLeadRow[],
  activeLeadIds: Set<string>,
): SwarmGraphNode[] {
  const filtered = ambientLeads.filter((lead) => !activeLeadIds.has(lead._id));
  return filtered.map((lead, index) => {
      const pos = ambientNodePosition(lead._id, index);
      const hash = hashLeadId(lead._id);
      return {
        id: lead._id,
        label: lead.personName ?? "Unknown",
        shortLabel: shortPersonName(lead.personName ?? "Unknown"),
        segment: SEGMENT_ORDER[index % SEGMENT_ORDER.length],
        isActive: false,
        isAmbient: true,
        color: AMBIENT_NODE_COLOR,
        val: AMBIENT_NODE_VAL,
        emissiveIntensity: AMBIENT_EMISSIVE,
        labelOffsetX: (hash % 24) - 12,
        labelOffsetY: 6 + (hash % 10),
        x: pos.x,
        y: pos.y,
        z: pos.z,
        fx: pos.x,
        fy: pos.y,
        fz: pos.z,
      };
    });
}

const SENTIMENT_VAL: Record<SwarmSentiment, number> = {
  objecting: 8,
  neutral: 5,
  positive: 3.5,
};

const SENTIMENT_EMISSIVE: Record<SwarmSentiment, number> = {
  objecting: 0.75,
  neutral: 0.55,
  positive: 0.45,
};

function layoutScale(totalNodes: number): number {
  return Math.min(1.35, Math.max(0.68, Math.sqrt(totalNodes / 8) * 0.58));
}

function segmentForPersona(
  personName: string | undefined,
  leadSegment?: PersonaSegment,
  fallbackIndex = 0,
): PersonaSegment {
  if (leadSegment) return leadSegment;
  const name = personName?.trim() ?? "";
  if (LOCKED_SEGMENT_ASSIGNMENTS[name]) {
    return LOCKED_SEGMENT_ASSIGNMENTS[name];
  }
  return SEGMENT_ORDER[fallbackIndex % SEGMENT_ORDER.length];
}

/** Build graph personas from a base set (locked or search leads) plus live reactions. */
export function deriveGraphPersonas(
  basePersonas: GraphPersonaRow[],
  reactions: SwarmReactionRow[],
): GraphPersonaRow[] {
  const byLead = new Map<string, GraphPersonaRow>();

  for (const persona of basePersonas) {
    byLead.set(persona._id, persona);
  }

  for (const reaction of reactions) {
    byLead.set(reaction.leadId, {
      _id: reaction.leadId,
      personName: reaction.personName,
      segment: reaction.segment,
    });
  }

  if (byLead.size === 0) return basePersonas;
  return [...byLead.values()];
}

/** Pick reactions for graph display — round 2 view falls back to round 1 per lead. */
export function pickReactionsForRound(
  reactions: SwarmReactionRow[],
  targetRound: 1 | 2 | 3,
): SwarmReactionRow[] {
  const byLead = new Map<string, SwarmReactionRow>();

  for (const reaction of reactions) {
    const round = reaction.round ?? 1;
    if (round === targetRound) {
      byLead.set(reaction.leadId, reaction);
    }
  }

  return [...byLead.values()];
}

export type SwarmDisplayRound = 1 | 2 | 3;

/** Baseline display: round 2 when present, else round 1 per lead. Round 3 = rewritten email retest. */
export function pickDisplayReactions(
  reactions: SwarmReactionRow[],
  displayRound: SwarmDisplayRound = 2,
): SwarmReactionRow[] {
  if (displayRound === 3) {
    return pickReactionsForRound(reactions, 3);
  }

  const round1ByLead = new Map<string, SwarmReactionRow>();
  const round2ByLead = new Map<string, SwarmReactionRow>();

  for (const reaction of reactions) {
    const round = reaction.round ?? 1;
    if (round === 2) {
      round2ByLead.set(reaction.leadId, reaction);
    } else if (round === 1) {
      round1ByLead.set(reaction.leadId, reaction);
    }
  }

  if (displayRound === 1) {
    return [...round1ByLead.values()];
  }

  const byLead = new Map(round1ByLead);
  for (const [leadId, reaction] of round2ByLead) {
    byLead.set(leadId, reaction);
  }
  return [...byLead.values()];
}

export function countReactionsByRound(
  reactions: SwarmReactionRow[] | undefined,
  personaCount: number,
): { round1: number; round2: number; round3: number; personaCount: number } {
  if (!reactions) {
    return { round1: 0, round2: 0, round3: 0, personaCount };
  }
  let round1 = 0;
  let round2 = 0;
  let round3 = 0;
  for (const reaction of reactions) {
    const round = reaction.round ?? 1;
    if (round === 3) round3 += 1;
    else if (round === 2) round2 += 1;
    else round1 += 1;
  }
  return { round1, round2, round3, personaCount };
}

export function buildSwarmGraphData(
  personas: GraphPersonaRow[],
  reactions: SwarmReactionRow[],
  displayRound: SwarmDisplayRound = 2,
  ambientLeads: AmbientLeadRow[] = [],
  draftMessage?: string,
): SwarmGraphData {
  const reactionByLead = new Map(
    reactions.map((reaction) => [reaction.leadId, reaction]),
  );
  const hasPeerRound =
    displayRound === 2
      ? reactions.some((reaction) => (reaction.round ?? 1) === 2)
      : displayRound === 3
        ? reactions.some((reaction) => (reaction.round ?? 1) === 3)
        : false;

  const nodes: SwarmGraphNode[] = personas.map((persona, index) => {
    const id = persona._id;
    const label = persona.personName ?? "Unknown";
    const reaction = reactionByLead.get(id);
    const segment = segmentForPersona(
      label,
      reaction?.segment ?? persona.segment,
      index,
    );

    const clusterPos = leadOrbitPosition(index, personas.length);
    const labelAngle = (index / Math.max(personas.length, 1)) * Math.PI * 2;
    const labelOffsetX = Math.cos(labelAngle) * 10;
    const labelOffsetY = 10 + Math.sin(labelAngle) * 4;

    if (reaction) {
      const activeSegment = reaction.segment ?? segment;
      const displayName = reaction.personName || label;
      return {
        id,
        label: displayName,
        shortLabel: shortPersonName(displayName),
        segment: activeSegment,
        sentiment: reaction.sentiment,
        reasoningText: reaction.reasoningText,
        citedSignal: reaction.citedSignal,
        round: reaction.round ?? 1,
        isActive: true,
        color: SENTIMENT_GRAPH_COLORS[reaction.sentiment],
        val: SENTIMENT_VAL[reaction.sentiment],
        emissiveIntensity: SENTIMENT_EMISSIVE[reaction.sentiment],
        x: clusterPos.x,
        y: clusterPos.y,
        z: clusterPos.z,
        fx: clusterPos.x,
        fy: clusterPos.y,
        fz: clusterPos.z,
        labelOffsetX,
        labelOffsetY,
      };
    }

    return {
      id,
      label,
      shortLabel: shortPersonName(label),
      segment,
      isActive: false,
      color: IDLE_GRAPH_COLOR,
      val: IDLE_NODE_VAL,
      emissiveIntensity: IDLE_EMISSIVE,
      x: clusterPos.x,
      y: clusterPos.y,
      z: clusterPos.z,
      fx: clusterPos.x,
      fy: clusterPos.y,
      fz: clusterPos.z,
      labelOffsetX,
      labelOffsetY,
    };
  });

  const links: SwarmGraphLink[] = [];
  const emailHub = buildEmailHubNode(draftMessage);

  for (const node of nodes) {
    if (node.isAmbient) continue;
    links.push({
      source: EMAIL_HUB_NODE_ID,
      target: node.id,
      color: emailHubLinkColor(node),
      isHubLink: true,
      peerActivated: false,
    });
  }

  if (displayRound === 2 || displayRound === 3) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.isAmbient || b.isAmbient) continue;
        if (a.segment === b.segment) {
          links.push({
            source: a.id,
            target: b.id,
            color: a.sentiment
              ? SENTIMENT_GRAPH_COLORS[a.sentiment]
              : SEGMENT_GRAPH_COLORS[a.segment],
            peerActivated:
              hasPeerRound && reactions.length > 0,
          });
        }
      }
    }
  }

  const activeLeadIds = new Set(personas.map((persona) => persona._id));
  const ambientNodes = buildAmbientNodes(ambientLeads, activeLeadIds);

  return { nodes: [emailHub, ...nodes, ...ambientNodes], links };
}

/** Force sim tuning — activeCount excludes ambient population nodes. */
export function graphForceSettings(
  activeCount: number,
  displayRound: SwarmDisplayRound = 1,
): {
  charge: number;
  linkDistance: number;
} {
  const scale = layoutScale(activeCount);
  if (displayRound === 1) {
    return {
      charge: -240 * scale,
      linkDistance: 22 + scale * 6,
    };
  }
  return {
    charge: -160 * scale,
    linkDistance: 28 + scale * 8,
  };
}

/** Per-node charge — ambient nodes don't participate in the force sim. */
export function chargeStrengthForNode(
  node: SwarmGraphNode,
  baseCharge: number,
): number {
  if (node.isAmbient || node.isEmailHub) return 0;
  return baseCharge;
}
