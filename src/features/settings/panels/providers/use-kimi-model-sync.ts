import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type AgentLoginStatusResult, getKimiProviderConfig } from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { type KimiCachedModel, useSettings } from "@/lib/settings";

export type KimiModelSync = {
	sync: () => Promise<void>;
	isSyncing: boolean;
};

/** Read the Kimi `{providers, models}` config and cache the model aliases into
 *  `app.kimi_provider`, so the composer picker (Rust `kimi_section`) and the
 *  Settings list stay in lockstep. Pure file read — no ACP round-trip. */
export function useKimiModelSync(): KimiModelSync {
	const queryClient = useQueryClient();
	const { settings, updateSettings } = useSettings();
	const kimi = settings.kimiProvider;

	const { mutateAsync, isPending } = useMutation({
		// Keyed so `useIsMutating` can surface a "Connecting…" state.
		mutationKey: ["kimiModelSync"],
		mutationFn: async () => {
			const config = await getKimiProviderConfig();
			// Picker `id` is the Kimi alias (`<provider>/<model>` key Kimi emits).
			const cached: KimiCachedModel[] = config.models.map((m) => ({
				id: m.id,
				label: m.label,
			}));
			// Preserve the user's enabled set when present; `null` (first sync)
			// stays null so the catalog shows every cached model by default. Drop
			// ids that no longer exist so a removed model can't linger enabled.
			const available = new Set(cached.map((m) => m.id));
			const enabledModelIds =
				kimi.enabledModelIds === null
					? null
					: kimi.enabledModelIds.filter((id) => available.has(id));
			await Promise.resolve(
				updateSettings({
					kimiProvider: { ...kimi, cachedModels: cached, enabledModelIds },
				}),
			);
			queryClient.invalidateQueries({
				queryKey: grexQueryKeys.agentModelSections,
			});
			// Flip Kimi's flag in the login-status cache directly so the Ready
			// badge reflects "has models" without re-running the slow CLI checks.
			queryClient.setQueryData<AgentLoginStatusResult>(
				grexQueryKeys.agentLoginStatus,
				(old) => (old ? { ...old, kimi: cached.length > 0 } : old),
			);
		},
	});

	const sync = useCallback(async () => {
		await mutateAsync();
	}, [mutateAsync]);

	return { sync, isSyncing: isPending };
}
