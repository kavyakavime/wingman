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
  round?: 1 | 2;
};

export type GraphPersonaRow = {
  _id: Id<"leads">;
  personName?: string;
  segment?: PersonaSegment;
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
  round?: 1 | 2;
  isActive: boolean;
  color: string;
  val: number;
  emissiveIntensity: number;
  x?: number;
  y?: number;
  z?: number;
};

export type SwarmGraphLink = {
  source: string;
  target: string;
  color: string;
  /** Flowing particles when round-2 peer influence is active. */
  peerActivated: boolean;
};

export type SwarmGraphData = {
  nodes: SwarmGraphNode[];
  links: SwarmGraphLink[];
};

export const IDLE_GRAPH_COLOR = "#a1a1aa";
export const IDLE_NODE_VAL = 6;
export const IDLE_EMISSIVE = 0.35;

const SENTIMENT_VAL: Record<SwarmSentiment, number> = {
  objecting: 14,
  neutral: 8,
  positive: 5,
};

const SENTIMENT_EMISSIVE: Record<SwarmSentiment, number> = {
  objecting: 3.5,
  neutral: 1.8,
  positive: 1.0,
};

function layoutScale(totalNodes: number): number {
  return Math.min(1.75, Math.max(1, Math.sqrt(totalNodes / 6) * 0.75));
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
export function pickDisplayReactions(
  reactions: SwarmReactionRow[],
  displayRound: 1 | 2 = 2,
): SwarmReactionRow[] {
  const round1ByLead = new Map<string, SwarmReactionRow>();
  const round2ByLead = new Map<string, SwarmReactionRow>();

  for (const reaction of reactions) {
    const round = reaction.round ?? 1;
    if (round === 2) {
      round2ByLead.set(reaction.leadId, reaction);
    } else {
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
): { round1: number; round2: number; personaCount: number } {
  if (!reactions) {
    return { round1: 0, round2: 0, personaCount };
  }
  let round1 = 0;
  let round2 = 0;
  for (const reaction of reactions) {
    if ((reaction.round ?? 1) === 2) round2 += 1;
    else round1 += 1;
  }
  return { round1, round2, personaCount };
}

export function buildSwarmGraphData(
  personas: GraphPersonaRow[],
  reactions: SwarmReactionRow[],
  displayRound: 1 | 2 = 2,
): SwarmGraphData {
  const reactionByLead = new Map(
    reactions.map((reaction) => [reaction.leadId, reaction]),
  );
  const hasRound2 = reactions.some((reaction) => (reaction.round ?? 1) === 2);
  const totalNodes = personas.length;

  const segmentCounts: Record<PersonaSegment, number> = {
    scaled: 0,
    early_stage: 0,
    vertical_specialist: 0,
  };

  const segmentTotals: Record<PersonaSegment, number> = {
    scaled: 0,
    early_stage: 0,
    vertical_specialist: 0,
  };

  personas.forEach((persona, index) => {
    const reaction = reactionByLead.get(persona._id);
    const segment = segmentForPersona(
      persona.personName,
      reaction?.segment ?? persona.segment,
      index,
    );
    segmentTotals[segment] += 1;
  });

  const nodes: SwarmGraphNode[] = personas.map((persona, index) => {
    const id = persona._id;
    const label = persona.personName ?? "Unknown";
    const reaction = reactionByLead.get(id);
    const segment = segmentForPersona(
      label,
      reaction?.segment ?? persona.segment,
      index,
    );
    const segmentIndex = segmentCounts[segment];
    segmentCounts[segment] += 1;

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
        color: SEGMENT_GRAPH_COLORS[activeSegment],
        val: SENTIMENT_VAL[reaction.sentiment],
        emissiveIntensity: SENTIMENT_EMISSIVE[reaction.sentiment],
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
    };
  });

  const links: SwarmGraphLink[] = [];
  // Round 1 = solo reactions — no segment links. Links only appear in round 2.
  if (displayRound === 2 && reactions.length > 0) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.segment === b.segment) {
          links.push({
            source: a.id,
            target: b.id,
            color: SEGMENT_GRAPH_COLORS[a.segment],
            peerActivated: hasRound2,
          });
        }
      }
    }
  }

  return { nodes, links };
}

/** Force sim tuning — round 1 spreads nodes apart for clearer solo reactions. */
export function graphForceSettings(
  nodeCount: number,
  displayRound: 1 | 2 = 1,
): {
  charge: number;
  linkDistance: number;
} {
  const scale = layoutScale(nodeCount);
  if (displayRound === 1) {
    return {
      charge: -520 * scale,
      linkDistance: 100,
    };
  }
  return {
    charge: -240 * scale,
    linkDistance: 44 + scale * 8,
  };
}
