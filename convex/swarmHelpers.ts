import type { Doc } from "./_generated/dataModel";
import type { PersonaReactionLead } from "../lib/openai";
import type { PersonaSegment } from "../lib/segments";

export function toReactionLead(lead: Doc<"leads">): PersonaReactionLead {
  if (!lead.personName?.trim()) {
    throw new Error(`Lead ${lead._id} is missing personName.`);
  }

  return {
    personName: lead.personName.trim(),
    role: lead.role,
    companyName: lead.companyName,
    segment: lead.segment as PersonaSegment | undefined,
    painSignal: lead.painSignal,
    socialSignal: lead.socialSignal,
    recentActivity: lead.recentActivity,
    activitySource: lead.activitySource,
    fundingStage: lead.fundingStage,
    locality: lead.locality,
  };
}
