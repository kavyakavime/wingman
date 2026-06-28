/**
 * Wingman audience workflow — Orange Slice engineered workflow pattern.
 * Same shape as Salesforce inbound routing: pull → enrich in loop → checkpoint.
 *
 *  1. Create spreadsheet (live run log)
 *  2. Resolve target companies from ICP (services.ai.generateObject)
 *  3. Pull decision-makers (services.company.getEmployeesFromLinkedin)
 *  4. For each lead: enrich + score (checkpointed rows in spreadsheet)
 */

import { ctx, services, withApiKey } from "orangeslice";
import type { CompanyEmployeeFromB2B } from "orangeslice/dist/expansion";
import type { AudienceLead } from "./audienceLead";
import { companyNameMatchesTarget, type TargetCompany } from "./audienceIcpFilter";
import { formatPersonRole, normalizeCompanyName } from "./linkedinHeadline";
import { normalizeLinkedInUrl } from "./linkedinUrl";
import { logOrangeSlice, summarizeLead } from "./orangeSliceLog";
import { OrangeSliceApiError } from "./orangeslice";

const SEARCH_ID = "orange-slice";
const SHEET = "leads";

export type WorkflowRunResult = {
  searchId: string;
  leads: AudienceLead[];
  spreadsheetId: string;
};

type SheetRow = Record<string, unknown>;

export function getTargetCompaniesForIcp(icp: string): TargetCompany[] | null {
  return presetCompanies(icp);
}

type CandidatePerson = {
  personName: string;
  linkedinUrl: string;
  companyName?: string;
  role?: string;
  locality?: string;
};

type WorkflowOptions = {
  pageSize?: number;
  spreadsheetId?: string;
  /** Called as each lead is ready — skipped when streamLeads is false. */
  onLead?: (lead: AudienceLead) => Promise<void>;
  /** When false, collect leads in the result only (hybrid merge emits later). */
  streamLeads?: boolean;
};

function employeeMatchesTargetCompany(
  emp: CompanyEmployeeFromB2B,
  company: TargetCompany,
): boolean {
  const name = emp.lp_company_name?.trim();
  if (!name) return false;
  return companyNameMatchesTarget(name, [company]);
}

function presetCompanies(icp: string): TargetCompany[] | null {
  const q = icp.toLowerCase();
  if (/\bhumanoid\b/.test(q)) {
    return [
      {
        name: "Figure AI",
        domain: "figure.ai",
        linkedinUrl: "https://www.linkedin.com/company/figure-ai",
      },
      {
        name: "Agility Robotics",
        domain: "agilityrobotics.com",
        linkedinUrl: "https://www.linkedin.com/company/agility-robotics",
      },
      {
        name: "Apptronik",
        domain: "apptronik.com",
        linkedinUrl: "https://www.linkedin.com/company/apptronik",
      },
      {
        name: "Boston Dynamics",
        domain: "bostondynamics.com",
        linkedinUrl: "https://www.linkedin.com/company/boston-dynamics",
      },
      {
        name: "1X Technologies",
        domain: "1x.tech",
        linkedinUrl: "https://www.linkedin.com/company/1x-technologies",
      },
      {
        name: "Sanctuary AI",
        domain: "sanctuary.ai",
        linkedinUrl: "https://www.linkedin.com/company/sanctuary-ai",
      },
      {
        name: "Unitree Robotics",
        domain: "unitree.com",
        linkedinUrl: "https://www.linkedin.com/company/unitree-robotics",
      },
    ];
  }
  return null;
}

function wantsLeadership(icp: string): boolean {
  return /\b(ceo|cto|cfo|coo|chief|founder|president|c-level|c level)\b/i.test(icp);
}

function employeeToCandidate(emp: CompanyEmployeeFromB2B): CandidatePerson | null {
  const personName =
    emp.lp_formatted_name?.trim() ||
    [emp.lp_first_name, emp.lp_last_name].filter(Boolean).join(" ").trim();
  const linkedinUrl = emp.lp_public_profile_url?.trim();
  if (!personName || !linkedinUrl) return null;

  return {
    personName,
    linkedinUrl: normalizeLinkedInUrl(linkedinUrl),
    companyName: emp.lp_company_name?.trim() || undefined,
    role: emp.lp_title?.trim() || emp.lp_headline?.trim() || undefined,
    locality: emp.lp_location_name?.trim() || undefined,
  };
}

function rowToLead(row: SheetRow): AudienceLead | null {
  const personName = String(row.person_name ?? "").trim();
  const linkedinUrl = String(row.linkedin_url ?? "").trim();
  if (!personName || !linkedinUrl) return null;

  const companyName = String(row.company_name ?? "").trim() || undefined;
  const role = String(row.role ?? "").trim() || undefined;

  return {
    resultType: "people",
    personName,
    companyName: companyName ? normalizeCompanyName(companyName) : undefined,
    role: role || (companyName ? formatPersonRole(undefined, companyName) : undefined),
    socialSignal: String(row.pain_signal ?? "").trim() || undefined,
    linkedinUrl: normalizeLinkedInUrl(linkedinUrl),
    locality: String(row.locality ?? "").trim() || undefined,
    fiberSearchId: SEARCH_ID,
  };
}

function candidateToLead(person: CandidatePerson, painSignal?: string): AudienceLead {
  const companyName = person.companyName?.trim();
  return {
    resultType: "people",
    personName: person.personName,
    companyName: companyName ? normalizeCompanyName(companyName) : undefined,
    role:
      person.role?.trim() ||
      (companyName ? formatPersonRole(undefined, companyName) : undefined),
    socialSignal: painSignal?.trim() || undefined,
    linkedinUrl: person.linkedinUrl,
    locality: person.locality?.trim() || undefined,
    fiberSearchId: SEARCH_ID,
  };
}

async function resolveTargetCompanies(icp: string): Promise<TargetCompany[]> {
  const preset = presetCompanies(icp);
  if (preset) {
    logOrangeSlice("workflow companies (preset)", { count: preset.length, companies: preset });
    return preset;
  }

  const { object } = await services.ai.generateObject({
    prompt: `List B2B companies that match this ICP. Return real companies with domains.\nICP: ${icp}`,
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

  const companies = ((object as { companies?: TargetCompany[] }).companies ?? []).filter(
    (c) => c?.name?.trim(),
  );
  logOrangeSlice("workflow companies (ai)", { count: companies.length, companies });
  return companies;
}

async function resolveCompanyLinkedInUrl(company: TargetCompany): Promise<string | null> {
  if (company.linkedinUrl?.trim()) return company.linkedinUrl.trim();

  const url = await services.company.linkedin.findUrl({
    companyName: company.name,
    website: company.domain,
  });
  return url?.trim() || null;
}

async function pullEmployeesAtCompany(
  linkedinUrl: string,
  icp: string,
  limit: number,
): Promise<CompanyEmployeeFromB2B[]> {
  const leadership = wantsLeadership(icp);
  const collected: CompanyEmployeeFromB2B[] = [];
  const seen = new Set<string>();

  const addEmployees = (employees: CompanyEmployeeFromB2B[]) => {
    for (const emp of employees) {
      const url = emp.lp_public_profile_url?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      collected.push(emp);
      if (collected.length >= limit) return;
    }
  };

  if (leadership) {
    try {
      const { employees } = await services.company.getEmployeesFromLinkedin({
        linkedinUrl,
        titleSqlFilter: `pos.title ~* '\\m(CEO|CTO|Chief|Founder|President)\\M'`,
        limit,
        usOnly: false,
      });
      addEmployees(employees);
    } catch {
      // fall through to web
    }

    const webPasses = [
      { titleVariations: ["CEO", "founder", "co-founder"] },
      { titleVariations: ["CTO", "Chief Technology Officer", "Chief Technical Officer"] },
    ];

    if (collected.length < limit) {
      for (const pass of webPasses) {
        if (collected.length >= limit) break;
        try {
          const { employees } = await services.company.getEmployeesFromLinkedin({
            linkedinUrl,
            searchStrategy: "web",
            titleVariations: pass.titleVariations,
            limit,
            usOnly: false,
            requireVerifiedPosition: false,
          } as Parameters<typeof services.company.getEmployeesFromLinkedin>[0]);
          addEmployees(employees);
        } catch {
          // try next pass
        }
      }
    }
  } else {
    const { employees } = await services.company.getEmployeesFromLinkedin({
      linkedinUrl,
      titleSqlFilter: `pos.title ~* '\\m(CEO|CTO|Chief|Founder|President|VP|Director|Head)\\M'`,
      limit,
      usOnly: false,
    });
    addEmployees(employees);
  }

  return collected;
}

async function pullDecisionMakers(
  companies: TargetCompany[],
  icp: string,
  limit: number,
): Promise<CandidatePerson[]> {
  const perCompany = Math.max(4, Math.ceil(limit / Math.max(companies.length, 1)));
  const seen = new Set<string>();
  const candidates: CandidatePerson[] = [];

  for (const company of companies) {
    const linkedinUrl = await resolveCompanyLinkedInUrl(company);
    if (!linkedinUrl) {
      logOrangeSlice("workflow skip company", { company: company.name, reason: "no linkedin url" });
      continue;
    }

    try {
      const employees = await pullEmployeesAtCompany(linkedinUrl, icp, perCompany);

      for (const emp of employees) {
        if (!employeeMatchesTargetCompany(emp, company)) continue;
        const person = employeeToCandidate(emp);
        if (!person || seen.has(person.linkedinUrl)) continue;
        seen.add(person.linkedinUrl);
        candidates.push({
          ...person,
          companyName: person.companyName ?? company.name,
        });
        if (candidates.length >= limit) break;
      }

      logOrangeSlice("workflow pulled from company", {
        company: company.name,
        employees: employees.length,
        total: candidates.length,
      });
    } catch (error) {
      logOrangeSlice("workflow company failed", {
        company: company.name,
        error: error instanceof Error ? error.message : "pull failed",
      });
    }

    if (candidates.length >= limit) break;
  }

  return candidates;
}

/** Import leads from a spreadsheet built in Orange Slice UI. */
export async function importLeadsFromOrangeSliceSpreadsheet(
  spreadsheetId: string,
  apiKey: string,
): Promise<WorkflowRunResult> {
  return withApiKey(apiKey.trim(), async () => {
    const ss = ctx.spreadsheet(spreadsheetId);
    const info = await ss.describe();
    const sheetName = info.sheets[0]?.name ?? SHEET;
    const result = await ss.sql(`SELECT * FROM "${sheetName}" LIMIT 100`);

    if (!("rows" in result) || !Array.isArray(result.rows)) {
      throw new OrangeSliceApiError("Orange Slice spreadsheet query returned no rows.", "api_error");
    }

    const leads = result.rows.map(rowToLead).filter((l): l is AudienceLead => l !== null);
    return { searchId: SEARCH_ID, leads, spreadsheetId };
  });
}

export async function runWingmanAudienceWorkflow(
  icp: string,
  apiKey: string,
  options?: WorkflowOptions,
): Promise<WorkflowRunResult> {
  const query = icp.trim();
  if (!query) {
    throw new OrangeSliceApiError("ICP query cannot be empty.", "api_error");
  }
  if (!apiKey.trim()) {
    throw new OrangeSliceApiError("ORANGESLICE_API_KEY is not configured.", "missing_api_key");
  }

  if (options?.spreadsheetId?.trim()) {
    return importLeadsFromOrangeSliceSpreadsheet(options.spreadsheetId.trim(), apiKey);
  }

  const limit = options?.pageSize ?? 25;
  const onLead = options?.onLead;
  const streamLeads = options?.streamLeads !== false;

  return withApiKey(apiKey.trim(), async () => {
    // 1. Spreadsheet live run log
    const ss = await ctx.createSpreadsheet({ name: `Wingman — ${query.slice(0, 70)}` });
    const sheet = ctx.spreadsheet(ss.id);
    await sheet.sql(
      `CREATE TABLE ${SHEET} (person_name, company_name, role, linkedin_url, locality, status, fit_score, pain_signal, step_log)`,
    );

    // 2. Resolve target companies
    const companies = await resolveTargetCompanies(query);
    if (companies.length === 0) {
      throw new OrangeSliceApiError("Could not resolve any target companies for this ICP.", "api_error");
    }

    // 3. Pull decision-makers
    const candidates = await pullDecisionMakers(companies, query, limit);
    logOrangeSlice("workflow pulled", { count: candidates.length, spreadsheetId: ss.id });

    if (candidates.length === 0) {
      throw new OrangeSliceApiError(
        "Orange Slice could not find decision-makers at matching companies for this ICP.",
        "api_error",
      );
    }

    // 4. Stream pulled leads to Wingman immediately (pull is the source of truth)
    const leads: AudienceLead[] = [];
    for (const person of candidates) {
      const lead = candidateToLead(person);
      leads.push(lead);
      if (streamLeads && onLead) await onLead(lead);
      logOrangeSlice("workflow lead pulled", { lead: summarizeLead(lead) });

      try {
        await sheet.sheet(SHEET).addRows({
          person_name: person.personName,
          company_name: person.companyName ?? "",
          role: person.role ?? "",
          linkedin_url: person.linkedinUrl,
          locality: person.locality ?? "",
          status: "Pulled",
          fit_score: "",
          pain_signal: "",
          step_log: "getEmployeesFromLinkedin",
        });
      } catch (sheetError) {
        logOrangeSlice("workflow sheet row skipped", {
          person: person.personName,
          error: sheetError instanceof Error ? sheetError.message : "sheet write failed",
        });
      }
    }

    logOrangeSlice("workflow complete", {
      spreadsheetId: ss.id,
      leadCount: leads.length,
      leads: leads.map(summarizeLead),
    });

    return { searchId: SEARCH_ID, leads, spreadsheetId: ss.id };
  });
}

export function orangeSliceSpreadsheetUrl(spreadsheetId: string): string {
  return `https://www.orangeslice.ai/dashboard?spreadsheet=${spreadsheetId}`;
}
