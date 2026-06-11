/**
 * QwenCodeAdapter - Qwen Code CLI ACP implementation of the generic provider adapter contract.
 *
 * @module QwenCodeAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface QwenCodeAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "qwenCode";
}

export class QwenCodeAdapter extends ServiceMap.Service<QwenCodeAdapter, QwenCodeAdapterShape>()(
  "t3/provider/Services/QwenCodeAdapter",
) {}
