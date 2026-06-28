/** Six locked demo personas — matched by name against leads from hour 2 Fiber search. */
export const LOCKED_DEMO_PERSONAS = [
  { personName: "Ian Bernstein" },
  { personName: "Frederik Fleck" },
  { personName: "Claire Delaunay" },
  { personName: "Peggy Johnson" },
  { personName: "Guy Altagar" },
  { personName: "Dave Grant" },
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
