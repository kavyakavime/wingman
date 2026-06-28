/** Six locked demo personas — resolved deterministically via Fiber kitchen-sink lookup. */
export const LOCKED_DEMO_PERSONAS = [
  { personName: "Ian Bernstein", companyName: "Hackerbot Industries" },
  { personName: "Frederik Fleck", companyName: "RoboService" },
  { personName: "Claire Delaunay", companyName: "OPALIN" },
  { personName: "Peggy Johnson", companyName: "Agility Robotics" },
  { personName: "Guy Altagar", companyName: "Unlimited Robotics" },
  { personName: "Dave Grant", companyName: "PickNik Robotics" },
] as const;

export type LockedDemoPersona = (typeof LOCKED_DEMO_PERSONAS)[number];

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isLockedPersonaName(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = normalizePersonName(name);
  return LOCKED_DEMO_PERSONAS.some(
    (p) => normalizePersonName(p.personName) === normalized,
  );
}

/** Swarm agents must not cite recentActivity for these personas (unrelated feed noise). */
export const IGNORE_RECENT_ACTIVITY_PERSONAS = [
  "Frederik Fleck",
  "Guy Altagar",
] as const;

export function shouldIgnoreRecentActivity(personName: string | undefined): boolean {
  if (!personName) return false;
  const normalized = normalizePersonName(personName);
  return IGNORE_RECENT_ACTIVITY_PERSONAS.some(
    (p) => normalizePersonName(p) === normalized,
  );
}
