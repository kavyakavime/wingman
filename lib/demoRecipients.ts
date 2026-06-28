import type { PersonaSegment } from "./segments";

/**
 * Opt-in demo recipients for Hour 9 controlled sends.
 *
 * These are NOT the locked CEO personas from the swarm simulation — they are
 * real people who explicitly agreed to receive a Wingman demo email.
 * Do not add real prospect emails here; keep this list small and opt-in only.
 *
 * Gmail plus-addressing (`+tag`) routes all three variants to one inbox for
 * demo verification while still sending distinct segment rewrites.
 */
export type DemoRecipient = {
  /** Display name in the send UI (not used in the email body). */
  label: string;
  email: string;
  segment: PersonaSegment;
};

export const DEMO_RECIPIENTS: DemoRecipient[] = [
  {
    label: "Kavya — early stage rewrite",
    email: "kavyakavime+early@gmail.com",
    segment: "early_stage",
  },
  {
    label: "Kavya — scaled rewrite",
    email: "kavyakavime+scaled@gmail.com",
    segment: "scaled",
  },
  {
    label: "Kavya — vertical specialist rewrite",
    email: "kavyakavime+vertical@gmail.com",
    segment: "vertical_specialist",
  },
];
