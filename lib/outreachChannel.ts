export type OutreachChannel = "email" | "physical_mail" | "linkedin_dm";

export function channelLabel(channel: OutreachChannel): string {
  if (channel === "email") return "Email";
  if (channel === "physical_mail") return "Physical mail";
  return "LinkedIn DM";
}
