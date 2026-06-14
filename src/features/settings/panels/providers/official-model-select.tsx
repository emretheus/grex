import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { loadAllAgentModelSections } from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { ModelMultiSelect } from "./model-multi-select";

/**
 * Picks which of a provider's official models appear in the composer's model
 * picker. Backed by `app.<provider>_enabled_model_ids`: `null` = all enabled
 * (the default), `[]` = none (hides the section in the composer).
 */
export function OfficialModelSelect({
	provider,
}: {
	provider: "claude" | "codex";
}) {
	const { settings, updateSettings } = useSettings();
	const sectionsQuery = useQuery({
		queryKey: grexQueryKeys.allAgentModelSections,
		queryFn: loadAllAgentModelSections,
	});

	const available = useMemo(() => {
		const section = sectionsQuery.data?.find((s) => s.id === provider);
		return (section?.options ?? []).map((o) => ({ id: o.id, label: o.label }));
	}, [sectionsQuery.data, provider]);

	const settingKey =
		provider === "claude" ? "claudeEnabledModelIds" : "codexEnabledModelIds";
	const stored = settings[settingKey];
	const allIds = available.map((o) => o.id);
	// `null` means "all enabled" — surface every available model as selected.
	const enabledIds = stored === null ? allIds : stored;
	const enabledSet = new Set(enabledIds);

	const persist = (ids: string[]) => {
		// Store `null` when everything is selected so models added in future
		// app builds stay visible; store the explicit list for a real subset.
		const idSet = new Set(ids);
		const allSelected =
			allIds.length > 0 && allIds.every((id) => idSet.has(id));
		void updateSettings({ [settingKey]: allSelected ? null : ids });
	};

	const onToggle = (id: string) => {
		persist(
			enabledSet.has(id)
				? enabledIds.filter((x) => x !== id)
				: [...enabledIds, id],
		);
	};

	return (
		<ModelMultiSelect
			enabledIds={enabledIds}
			enabledSet={enabledSet}
			available={available}
			onToggle={onToggle}
			onClear={() => persist([])}
			loading={sectionsQuery.isLoading}
			grouped={false}
		/>
	);
}
