/**
 * GooseAdapter - Goose CLI ACP implementation of the generic provider adapter contract.
 *
 * @module GooseAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface GooseAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "goose";
}

export class GooseAdapter extends ServiceMap.Service<GooseAdapter, GooseAdapterShape>()(
  "t3/provider/Services/GooseAdapter",
) {}
