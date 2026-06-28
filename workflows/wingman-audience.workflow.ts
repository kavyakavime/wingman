/**
 * Wingman audience workflow — Orange Slice engineered revenue workflow pattern.
 * @see https://www.orangeslice.ai
 *
 * Same shape as Salesforce inbound routing: pull → enrich in loop → checkpoint.
 *
 * Steps:
 *  1. Accept ICP input
 *  2. Resolve target companies (services.ai.generateObject)
 *  3. Pull decision-makers (services.company.getEmployeesFromLinkedin)
 *  4. Per lead: enrich (person + company) + score (services.ai.generateObject)
 *  5. Write rows to Orange Slice spreadsheet with status (Running → Done / Error)
 */

import { ctx, services } from "orangeslice";
import type { CompanyEmployeeFromB2B } from "orangeslice/dist/expansion";

export type WingmanAudienceRow = {
  person_name: string;
  company_name: string;
  role: string;
  linkedin_url: string;
  locality: string;
  status: "Running" | "Done" | "Error";
  fit_score: string;
  pain_signal: string;
  step_log: string;
};

type TargetCompany = { name: string; domain?: string; linkedinUrl?: string };

type LinkedInProfile = {
  name?: string | null;
  title?: string | null;
  company_name?: string | null;
  headline?: string | null;
  locality?: string | null;
  location?: string | null;
};

function employeeToRow(emp: CompanyEmployeeFromB2B, companyName: string) {
  const personName =
    emp.lp_formatted_name?.trim() ||
    [emp.lp_first_name, emp.lp_last_name].filter(Boolean).join(" ").trim();
  return {
    personName,
    linkedinUrl: emp.lp_public_profile_url?.trim() ?? "",
    companyName: emp.lp_company_name?.trim() || companyName,
    role: emp.lp_title?.trim() || emp.lp_headline?.trim() || "",
    locality: emp.lp_location_name?.trim() || "",
  };
}

export async function wingmanAudienceWorkflow(input: {
  icp: string;
  limit?: number;
}): Promise<{ spreadsheetId: string; rows: WingmanAudienceRow[] }> {
  const icp = input.icp.trim();
  const limit = input.limit ?? 25;

  const ss = await ctx.createSpreadsheet({ name: `Wingman Audience — ${icp.slice(0, 60)}` });
  const sheet = ctx.spreadsheet(ss.id);

  await sheet.sql(
    `CREATE TABLE leads (person_name, company_name, role, linkedin_url, locality, status, fit_score, pain_signal, step_log)`,
  );

  const { object: plan } = await services.ai.generateObject({
    prompt: `List B2B companies matching this ICP with domains.\nICP: ${icp}`,
    schema: {
      type: "object",
      properties: {
        companies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              domain: { type: "string" },
              linkedinUrl: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["companies"],
    },
  });

  const companies = ((plan as { companies?: TargetCompany[] }).companies ?? []).slice(0, 10);
  const candidates: ReturnType<typeof employeeToRow>[] = [];
  const seen = new Set<string>();

  for (const company of companies) {
    const linkedinUrl =
      company.linkedinUrl?.trim() ||
      (await services.company.linkedin.findUrl({
        companyName: company.name,
        website: company.domain,
      }));

    if (!linkedinUrl) continue;

    const { employees } = await services.company.getEmployeesFromLinkedin({
      linkedinUrl,
      searchStrategy: "web",
      titleVariations: ["CEO", "CTO", "founder"],
      limit: Math.ceil(limit / companies.length) + 2,
      usOnly: false,
    });

    for (const emp of employees) {
      const row = employeeToRow(emp, company.name);
      if (!row.personName || !row.linkedinUrl || seen.has(row.linkedinUrl)) continue;
      seen.add(row.linkedinUrl);
      candidates.push(row);
      if (candidates.length >= limit) break;
    }
    if (candidates.length >= limit) break;
  }

  const completed: WingmanAudienceRow[] = [];

  for (const person of candidates) {
    try {
      const profile = (await services.person.linkedin.enrich({
        url: person.linkedinUrl,
        extended: true,
      })) as LinkedInProfile | null;

      const company = person.companyName
        ? await services.company.linkedin.enrich({ companyName: person.companyName })
        : null;

      const { object: scored } = await services.ai.generateObject({
        prompt: `Score fit for ICP and one pain signal.\nICP: ${icp}\nPerson: ${profile?.name}\nRole: ${profile?.title}\nCompany: ${profile?.company_name}\nHeadline: ${profile?.headline}\nCompany: ${JSON.stringify(company ?? {})}`,
        schema: {
          type: "object",
          properties: {
            fitScore: { type: "number" },
            painSignal: { type: "string" },
          },
          required: ["fitScore", "painSignal"],
        },
      });

      const row: WingmanAudienceRow = {
        person_name: profile?.name?.trim() ?? person.personName,
        company_name: profile?.company_name?.trim() ?? person.companyName,
        role: profile?.title?.trim() ?? person.role,
        linkedin_url: person.linkedinUrl,
        locality: profile?.locality?.trim() ?? profile?.location?.trim() ?? person.locality,
        status: "Done",
        fit_score: String((scored as { fitScore?: number }).fitScore ?? ""),
        pain_signal: (scored as { painSignal?: string }).painSignal ?? "",
        step_log: "enrich+score",
      };
      completed.push(row);
      await sheet.sheet("leads").addRows(row);
    } catch (error) {
      await sheet.sheet("leads").addRows({
        person_name: person.personName,
        company_name: person.companyName,
        role: person.role,
        linkedin_url: person.linkedinUrl,
        locality: person.locality,
        status: "Error",
        fit_score: "",
        pain_signal: "",
        step_log: error instanceof Error ? error.message : "enrich failed",
      });
    }
  }

  return { spreadsheetId: ss.id, rows: completed };
}
