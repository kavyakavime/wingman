/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentReactions from "../agentReactions.js";
import type * as enrichActions from "../enrichActions.js";
import type * as fiberActions from "../fiberActions.js";
import type * as leads from "../leads.js";
import type * as ping from "../ping.js";
import type * as rewriteActions from "../rewriteActions.js";
import type * as seedDemo from "../seedDemo.js";
import type * as segmentRewrites from "../segmentRewrites.js";
import type * as sendActions from "../sendActions.js";
import type * as sentLog from "../sentLog.js";
import type * as swarmActions from "../swarmActions.js";
import type * as swarmHelpers from "../swarmHelpers.js";
import type * as swarmRound2 from "../swarmRound2.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentReactions: typeof agentReactions;
  enrichActions: typeof enrichActions;
  fiberActions: typeof fiberActions;
  leads: typeof leads;
  ping: typeof ping;
  rewriteActions: typeof rewriteActions;
  seedDemo: typeof seedDemo;
  segmentRewrites: typeof segmentRewrites;
  sendActions: typeof sendActions;
  sentLog: typeof sentLog;
  swarmActions: typeof swarmActions;
  swarmHelpers: typeof swarmHelpers;
  swarmRound2: typeof swarmRound2;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
