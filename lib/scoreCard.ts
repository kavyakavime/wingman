import { LOCKED_SEGMENT_ASSIGNMENTS, SEGMENT_ORDER, type PersonaSegment } from "./segments";
import { inferLeadSegment } from "./inferSegment";
import type { SwarmReactionRow, SwarmSentiment } from "./swarmGraphData";

/**
 * Heuristic sentiment → projected reply rate (%). Cold outbound baseline is
 * sub-1% overall; these are relative segment signals, not promises.
 */
const SENTIMENT_REPLY_RATE: Record<SwarmSentiment, number> = {
  positive: 1.2,
  neutral: 0.45,
  objecting: 0.08,
};

const SENTIMENT_NEGATIVITY: Record<SwarmSentiment, number> = {
  objecting: 0,
  neutral: 1,
  positive: 2,
};

export type SegmentObjection = {
  personName: string;
  sentiment: SwarmSentiment;
  citedSignal: string;
  reasoningText: string;
};

export type SegmentScore = {
  segment: PersonaSegment;
  predictedReplyRate: number | null;
  /** citedSignal(s) from the most negative sentiment tier in this segment. */
  topSignals: string[];
  /** Full persona reactions for rewrite prompts. */
  objections: SegmentObjection[];
  /** Sentiment tier those topSignals came from. */
  dominantSentiment: SwarmSentiment | null;
  personaCount: number;
};

function segmentForReaction(reaction: SwarmReactionRow): PersonaSegment {
  if (reaction.segment) return reaction.segment;
  const name = reaction.personName?.trim() ?? "";
  if (name && LOCKED_SEGMENT_ASSIGNMENTS[name]) {
    return LOCKED_SEGMENT_ASSIGNMENTS[name];
  }
  return inferLeadSegment({
    _id: reaction.leadId,
    personName: name,
  });
}

/** Aggregate segment scores from display reactions (post pickDisplayReactions). */
export function computeSegmentScores(reactions: SwarmReactionRow[]): SegmentScore[] {
  return SEGMENT_ORDER.map((segment) => {
    const inSegment = reactions.filter((r) => segmentForReaction(r) === segment);

    if (inSegment.length === 0) {
      return {
        segment,
        predictedReplyRate: null,
        topSignals: [],
        objections: [],
        dominantSentiment: null,
        personaCount: 0,
      };
    }

    const predictedReplyRate =
      Math.round(
        (inSegment.reduce((sum, r) => sum + SENTIMENT_REPLY_RATE[r.sentiment], 0) /
          inSegment.length) *
          100,
      ) / 100;

    const minNegativity = Math.min(
      ...inSegment.map((r) => SENTIMENT_NEGATIVITY[r.sentiment]),
    );
    const priorityReactions = inSegment.filter(
      (r) => SENTIMENT_NEGATIVITY[r.sentiment] === minNegativity,
    );
    const topSignals = priorityReactions
      .map((r) => r.citedSignal.trim())
      .filter(Boolean);

    const objections = [...inSegment]
      .sort(
        (a, b) => SENTIMENT_NEGATIVITY[a.sentiment] - SENTIMENT_NEGATIVITY[b.sentiment],
      )
      .slice(0, 6)
      .map((r) => ({
        personName: r.personName?.trim() || "Persona",
        sentiment: r.sentiment,
        citedSignal: r.citedSignal.trim(),
        reasoningText: r.reasoningText.trim(),
      }))
      .filter((o) => o.citedSignal || o.reasoningText);

    const dominantSentiment =
      priorityReactions[0]?.sentiment ??
      (minNegativity === 0 ? "objecting" : minNegativity === 1 ? "neutral" : "positive");

    return {
      segment,
      predictedReplyRate,
      topSignals,
      objections,
      dominantSentiment,
      personaCount: inSegment.length,
    };
  });
}

/** Overall projected reply rate across all reactions (typically <1%). */
export function computeOverallReplyRate(reactions: SwarmReactionRow[]): number | null {
  if (reactions.length === 0) return null;
  const avg =
    reactions.reduce((sum, r) => sum + SENTIMENT_REPLY_RATE[r.sentiment], 0) /
    reactions.length;
  return Math.round(avg * 100) / 100;
}
