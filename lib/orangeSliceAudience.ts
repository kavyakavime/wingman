/**
 * Wingman → Orange Slice audience entrypoint.
 */

import { OrangeSliceApiError } from "./orangeslice";
import type { AudienceLead } from "./audienceLead";
import {
  importLeadsFromOrangeSliceSpreadsheet,
  orangeSliceSpreadsheetUrl,
  runWingmanAudienceWorkflow,
} from "./orangeSliceWorkflow";

export type OrangeSliceAudienceResult = {
  searchId: string;
  leads: AudienceLead[];
  spreadsheetId?: string;
};

export { orangeSliceSpreadsheetUrl, importLeadsFromOrangeSliceSpreadsheet };

export async function fetchAudienceFromOrangeSlice(
  icp: string,
  apiKey: string,
  options?: {
    pageSize?: number;
    spreadsheetId?: string;
    onLead?: (lead: AudienceLead) => Promise<void>;
    streamLeads?: boolean;
  },
): Promise<OrangeSliceAudienceResult> {
  const query = icp.trim();
  if (!query && !options?.spreadsheetId) {
    throw new OrangeSliceApiError("ICP query cannot be empty.", "api_error");
  }

  const presetSheet = process.env.ORANGESLICE_AUDIENCE_SPREADSHEET_ID?.trim();
  const result = await runWingmanAudienceWorkflow(query || "import", apiKey, {
    pageSize: options?.pageSize,
    spreadsheetId: options?.spreadsheetId ?? presetSheet,
    onLead: options?.onLead,
    streamLeads: options?.streamLeads,
  });

  return {
    searchId: result.searchId,
    leads: result.leads,
    spreadsheetId: result.spreadsheetId,
  };
}
