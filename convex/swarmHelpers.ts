import type { Doc } from "./_generated/dataModel";
import type { PersonaReactionLead } from "../lib/openai";
import { inferLeadSegment } from "../lib/inferSegment";

export function toReactionLead(lead: Doc<"leads">): PersonaReactionLead {
  if (!lead.personName?.trim()) {
    throw new Error(`Lead ${lead._id} is missing personName.`);
  }

  const segment = inferLeadSegment({
    _id: lead._id,
    personName: lead.personName,
    role: lead.role,
    segment: lead.segment as PersonaReactionLead["segment"],
  });

  return {
    personName: lead.personName.trim(),
    role: lead.role,
    companyName: lead.companyName,
    segment,
    painSignal: lead.painSignal,
    socialSignal: lead.socialSignal,
    recentActivity: lead.recentActivity,
    activitySource: lead.activitySource,
    fundingStage: lead.fundingStage,
    locality: lead.locality,
  };
}
