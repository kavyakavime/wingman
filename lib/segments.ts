export const PERSONA_SEGMENTS = [
  "scaled",
  "early_stage",
  "vertical_specialist",
] as const;

export type PersonaSegment = (typeof PERSONA_SEGMENTS)[number];

/** Locked demo persona → segment mapping (hour 4). */
export const LOCKED_SEGMENT_ASSIGNMENTS: Record<string, PersonaSegment> = {
  "Peggy Johnson": "scaled",
  "Claire Delaunay": "scaled",
  "Ian Bernstein": "early_stage",
  "Dave Grant": "early_stage",
  "Frederik Fleck": "vertical_specialist",
  "Guy Altagar": "vertical_specialist",
};

export const SEGMENT_LABELS: Record<PersonaSegment, string> = {
  scaled: "Scaled",
  early_stage: "Early stage",
  vertical_specialist: "Vertical specialist",
};

export const SEGMENT_DESCRIPTIONS: Record<PersonaSegment, string> = {
  scaled: "Large, established operators",
  early_stage: "Founders and early-stage builders",
  vertical_specialist: "Deep domain / vertical focus",
};

/** Tailwind classes for segment badges and group headers. */
export const SEGMENT_STYLES: Record<
  PersonaSegment,
  { badge: string; border: string; header: string }
> = {
  scaled: {
    badge:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    border: "border-violet-200 dark:border-violet-900",
    header: "text-violet-700 dark:text-violet-300",
  },
  early_stage: {
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    border: "border-amber-200 dark:border-amber-900",
    header: "text-amber-700 dark:text-amber-300",
  },
  vertical_specialist: {
    badge: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
    border: "border-teal-200 dark:border-teal-900",
    header: "text-teal-700 dark:text-teal-300",
  },
};

export const SEGMENT_ORDER: PersonaSegment[] = [
  "scaled",
  "early_stage",
  "vertical_specialist",
];

/** Hex colors for 3D graph nodes (matches Tailwind violet/amber/teal-500). */
export const SEGMENT_GRAPH_COLORS: Record<PersonaSegment, string> = {
  scaled: "#8b5cf6",
  early_stage: "#f59e0b",
  vertical_specialist: "#14b8a6",
};
