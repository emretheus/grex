/**
 * AuggieAdapter - Auggie CLI ACP implementation of the generic provider adapter contract.
 *
 * @module AuggieAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface AuggieAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "auggie";
}

export class AuggieAdapter extends ServiceMap.Service<AuggieAdapter, AuggieAdapterShape>()(
  "t3/provider/Services/AuggieAdapter",
) {}
