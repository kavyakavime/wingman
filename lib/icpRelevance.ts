import type { AudienceLead } from "./audienceLead";

/** ICP asks for a narrow vertical (humanoid robotics, etc.). */
export function isNicheVerticalIcp(icp: string): boolean {
  return /\b(humanoid|robotics?\s+lab|robot\s+lab|humanoid\s+robot)/i.test(icp);
}

export function icpWantsCeoOrCto(icp: string): boolean {
  return /\b(ceo|cto|chief executive|chief technology)/i.test(icp);
}

export function icpWantsVpEngineering(icp: string): boolean {
  return /\b(vp\s+(of\s+)?engineering|vice president.*engineering)/i.test(icp);
}

function leadHaystack(lead: AudienceLead): string {
  return [lead.personName, lead.companyName, lead.role, lead.socialSignal]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const ROBOTICS_TERMS =
  /\b(humanoid|robotics?|robot\s+lab|robotic|biped|manipulator|embodied\s+ai|physical\s+ai)\b/i;

const KNOWN_ROBOTICS_COMPANIES =
  /\b(figure|agility\s+robotics|boston\s+dynamics|atlas\s+robotics|1x\s+technologies|apptronik|sanctuary\s+ai|unitree|hello\s+robot|cobot|the\s+bot\s+company|neura\s+robotics|galbot|robotera|galaxea|engineai|limx|rainbow\s+robotics|pudu|familiar\s+machines|bedrock\s+robotics|ubtech)\b/i;

const OFF_TOPIC_COMPANIES =
  /\b(pandadoc|procore|quantinuum|bimanywhere|custos|creao\s+ai|saas|construction\s+software|document\s+management)\b/i;

const C_SUITE_ROLE =
  /\b(ceo|cto|chief executive|chief technology|chief robot|founder|co-?founder)\b/i;

const VP_ENGINEERING_ROLE =
  /\b(vp\s+(of\s+)?engineering|vice president.*engineering)\b/i;

const QUALIFYING_DECISION_MAKER =
  /\b(ceo|cto|chief executive|chief technology|chief robot|vp\s+(of\s+)?engineering|vice president.*engineering|founder|co-?founder|president)\b/i;

const UNWANTED_ROLES_WHEN_CEO_CTO =
  /\b(cfo|chief financial|chief people|chief legal|chief revenue|chief commercial|chief of staff|chief business|hr\b|human resources|counsel|secretary)\b/i;

const ACADEMIC_OR_STUDENT =
  /\b(university|college|institut|professor|docente|postdoc|postdoctoral|doctoral student|phd student|research fellow|faculty|lecturer|intern\b|internship|student at|kist\b|ieee\b|unac\b|conestoga)\b/i;

const NON_TARGET_ROLES =
  /\b(partnerships?\s*&?\s*gtm|go-to-market|executive assistant|member of technical staff|software engineer\b|research and development intern|chairperson|proprietor|docente|teaching|adjunct)\b/i;

const NON_ROBOTICS_EMPLOYERS =
  /\b(us army|amazon\b(?![^|]*robot)|google\b(?![^|]*robot)|meta\b(?![^|]*robot)|microsoft\b(?![^|]*robot)|ieee women|belief enterprises|fieldmotion|starkhacks|crowdgen|botanoids|i hub robotics|sigmoid doo|optimising technologies|our robot future)\b/i;

/** Hard-reject leads that should never appear for niche CEO/CTO robotics ICPs. */
export function isDisqualifiedLead(lead: AudienceLead, icp: string): boolean {
  const text = leadHaystack(lead);

  if (ACADEMIC_OR_STUDENT.test(text)) return true;
  if (NON_TARGET_ROLES.test(text)) return true;
  if (NON_ROBOTICS_EMPLOYERS.test(text)) return true;

  // "Persona" is usually identity verification — not humanoid Persona AI
  if (/\bpersona\b/i.test(text) && !ROBOTICS_TERMS.test(text)) return true;

  if (icpWantsCeoOrCto(icp) || icpWantsVpEngineering(icp)) {
    if (!QUALIFYING_DECISION_MAKER.test(text)) return true;
    if (/\bintern\b/i.test(text)) return true;
  }

  if (isNicheVerticalIcp(icp)) {
    if (OFF_TOPIC_COMPANIES.test(text) && !ROBOTICS_TERMS.test(text)) return true;
    const atRoboticsCo = KNOWN_ROBOTICS_COMPANIES.test(text);
    const hasRoboticsSignal = ROBOTICS_TERMS.test(text);
    if (!atRoboticsCo && !hasRoboticsSignal) return true;
  }

  return false;
}

/** Score how well a lead matches the ICP (higher = better). */
export function scoreLeadIcpMatch(lead: AudienceLead, icp: string): number {
  const text = leadHaystack(lead);
  let score = 0;

  if (ROBOTICS_TERMS.test(icp)) {
    if (ROBOTICS_TERMS.test(text)) score += 4;
    if (KNOWN_ROBOTICS_COMPANIES.test(text)) score += 8;
    if (OFF_TOPIC_COMPANIES.test(text) && !ROBOTICS_TERMS.test(text)) score -= 12;
  }

  if (icpWantsCeoOrCto(icp)) {
    if (C_SUITE_ROLE.test(text)) score += 4;
    if (VP_ENGINEERING_ROLE.test(text)) score += 2;
    if (UNWANTED_ROLES_WHEN_CEO_CTO.test(text) && !/\b(ceo|cto)\b/i.test(text)) score -= 8;
  }

  if (icpWantsVpEngineering(icp) && VP_ENGINEERING_ROLE.test(text)) score += 3;

  if (/\blab/i.test(icp) && /\b(lab|labs|research)\b/i.test(text)) score += 1;

  return score;
}

export function minIcpScore(icp: string): number {
  if (isNicheVerticalIcp(icp) && icpWantsCeoOrCto(icp)) return 6;
  if (isNicheVerticalIcp(icp)) return 4;
  return 0;
}

/** Keep the best-matching leads for a niche ICP; drop obvious noise. */
export function rankAndFilterByIcp(
  leads: AudienceLead[],
  icp: string,
  limit: number,
): AudienceLead[] {
  const minScore = minIcpScore(icp);
  const qualified = leads.filter((lead) => !isDisqualifiedLead(lead, icp));

  const ranked = qualified
    .map((lead) => ({ lead, score: scoreLeadIcpMatch(lead, icp) }))
    .sort((a, b) => b.score - a.score);

  const passing = ranked.filter((r) => r.score >= minScore).map((r) => r.lead);
  if (passing.length >= limit) return passing.slice(0, limit);

  // Not enough strict matches — return top qualified scorers (never disqualified junk).
  return ranked.slice(0, limit).map((r) => r.lead);
}
