import {
  LOCKED_SEGMENT_ASSIGNMENTS,
  SEGMENT_ORDER,
  type PersonaSegment,
} from "./segments";

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Stable segment bucket for leads without an explicit segment assignment. */
export function inferLeadSegment(lead: {
  personName?: string | null;
  role?: string | null;
  segment?: PersonaSegment | null;
  _id?: string;
}): PersonaSegment {
  if (lead.segment) return lead.segment;

  const name = lead.personName?.trim() ?? "";
  if (name && LOCKED_SEGMENT_ASSIGNMENTS[name]) {
    return LOCKED_SEGMENT_ASSIGNMENTS[name];
  }

  const role = (lead.role ?? "").toLowerCase();
  if (
    /cfo|finance|vp sales|cro|chief revenue|revenue|sales|enterprise|coo|president/.test(
      role,
    )
  ) {
    return "scaled";
  }
  if (/founder|ceo|co-founder|startup|early|seed|product|cto|engineering/.test(role)) {
    return "early_stage";
  }
  if (/specialist|vertical|domain|industry|head of|director|lead/.test(role)) {
    return "vertical_specialist";
  }

  const key = lead._id ?? name;
  if (!key) return SEGMENT_ORDER[0];
  return SEGMENT_ORDER[hashKey(key) % SEGMENT_ORDER.length];
}
