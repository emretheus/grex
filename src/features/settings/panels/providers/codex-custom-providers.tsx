import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	type CodexCustomModel,
	type CodexCustomProvider,
	deleteCodexCustomProvider,
	fetchCodexProviderModels,
	listCodexCustomProviders,
	upsertCodexCustomProvider,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { ModelMultiSelect } from "./model-multi-select";

type Draft = {
	/** Original id when editing; a rename replaces the old entry. */
	originalId: string | null;
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	models: CodexCustomModel[];
	enabledModelIds: string[] | null;
};

const EMPTY_DRAFT: Draft = {
	originalId: null,
	id: "",
	name: "",
	baseUrl: "",
	apiKey: "",
	models: [],
	enabledModelIds: null,
};

/** Codex `modelProvider` must be a bare slug; it also forms model ids. */
function sanitizeId(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function CodexCustomProvidersPanel() {
	const { t } = useTranslation(["providers", "common"]);
	const queryClient = useQueryClient();
	const providersQuery = useQuery({
		queryKey: grexQueryKeys.codexCustomProviders,
		queryFn: listCodexCustomProviders,
	});
	const providers = providersQuery.data ?? [];

	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const baseUrlId = useId();
	const apiKeyId = useId();
	const idFieldId = useId();
	const nameId = useId();

	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: grexQueryKeys.codexCustomProviders,
		});
		// The composer + Settings catalogs both derive from these providers.
		void queryClient.invalidateQueries({
			queryKey: grexQueryKeys.agentModelSections,
		});
		void queryClient.invalidateQueries({
			queryKey: grexQueryKeys.allAgentModelSections,
		});
	};

	const saveMutation = useMutation({
		mutationFn: async (next: Draft) => {
			const id = sanitizeId(next.id);
			if (!id) throw new Error(t("codexCustom.errors.idRequired"));
			if (!next.baseUrl.trim())
				throw new Error(t("codexCustom.errors.baseUrlRequired"));
			const provider: CodexCustomProvider = {
				id,
				name: next.name.trim() || id,
				baseUrl: next.baseUrl.trim(),
				apiKey: next.apiKey.trim(),
				models: next.models,
				enabledModelIds: next.enabledModelIds,
			};
			// Rename → drop the stale entry first.
			if (next.originalId && next.originalId !== id) {
				await deleteCodexCustomProvider(next.originalId);
			}
			await upsertCodexCustomProvider(provider);
		},
		onSuccess: () => {
			invalidate();
			setDraft(null);
			setError(null);
		},
		onError: (e) => setError(e instanceof Error ? e.message : String(e)),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteCodexCustomProvider(id),
		onSuccess: invalidate,
	});

	const fetchMutation = useMutation({
		mutationFn: (d: Draft) =>
			fetchCodexProviderModels(d.baseUrl.trim(), d.apiKey.trim()),
		onSuccess: (models) => {
			setError(null);
			setDraft((prev) =>
				prev ? { ...prev, models, enabledModelIds: null } : prev,
			);
		},
		onError: (e) => setError(e instanceof Error ? e.message : String(e)),
	});

	const startEdit = (provider: CodexCustomProvider) =>
		setDraft({
			originalId: provider.id,
			id: provider.id,
			name: provider.name,
			baseUrl: provider.baseUrl,
			apiKey: provider.apiKey,
			models: provider.models,
			enabledModelIds: provider.enabledModelIds,
		});

	if (draft) {
		const allSlugs = draft.models.map((m) => m.slug);
		const enabledIds =
			draft.enabledModelIds === null ? allSlugs : draft.enabledModelIds;
		const enabledSet = new Set(enabledIds);
		const setEnabled = (ids: string[]) => {
			const idSet = new Set(ids);
			const allSelected =
				allSlugs.length > 0 && allSlugs.every((s) => idSet.has(s));
			setDraft((prev) =>
				prev ? { ...prev, enabledModelIds: allSelected ? null : ids } : prev,
			);
		};

		return (
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-2 gap-2">
					<div className="flex flex-col gap-1">
						<Label htmlFor={idFieldId}>{t("codexCustom.providerId")}</Label>
						<Input
							id={idFieldId}
							value={draft.id}
							placeholder="hundun"
							onChange={(e) => setDraft({ ...draft, id: e.target.value })}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label htmlFor={nameId}>{t("codexCustom.displayName")}</Label>
						<Input
							id={nameId}
							value={draft.name}
							placeholder="Codex (Hundun)"
							onChange={(e) => setDraft({ ...draft, name: e.target.value })}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor={baseUrlId}>{t("common.baseUrl")}</Label>
					<Input
						id={baseUrlId}
						value={draft.baseUrl}
						placeholder="https://api.example.com/v1"
						onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor={apiKeyId}>{t("common.apiKey")}</Label>
					<Input
						id={apiKeyId}
						type="password"
						value={draft.apiKey}
						placeholder="sk-…"
						onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
					/>
				</div>

				<div className="flex items-center justify-between gap-2">
					<div className="flex flex-col gap-1">
						<span className="text-ui">{t("common.models")}</span>
						<span className="text-mini text-muted-foreground">
							{t("codexCustom.modelsHint")}
						</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!draft.baseUrl.trim() || fetchMutation.isPending}
						onClick={() => fetchMutation.mutate(draft)}
					>
						{fetchMutation.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : null}
						{t("actions.fetchModels")}
					</Button>
				</div>
				<ModelMultiSelect
					enabledIds={enabledIds}
					enabledSet={enabledSet}
					available={draft.models.map((m) => ({
						id: m.slug,
						label: m.label || m.slug,
					}))}
					onToggle={(id) =>
						setEnabled(
							enabledSet.has(id)
								? enabledIds.filter((x) => x !== id)
								: [...enabledIds, id],
						)
					}
					onClear={() => setEnabled([])}
					loading={fetchMutation.isPending}
					grouped={false}
					triggerClassName="w-full"
				/>

				{error ? <p className="text-mini text-destructive">{error}</p> : null}

				<div className="flex items-center justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							setDraft(null);
							setError(null);
						}}
					>
						{t("common:actions.cancel")}
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={saveMutation.isPending}
						onClick={() => saveMutation.mutate(draft)}
					>
						{saveMutation.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : null}
						{t("common:actions.save")}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{providers.length === 0 ? (
				<p className="text-mini text-muted-foreground">
					{t("codexCustom.emptyState")}
				</p>
			) : (
				providers.map((provider) => (
					<div
						key={provider.id}
						className="flex items-center justify-between gap-2 rounded-lg border border-input bg-muted/20 px-3 py-2"
					>
						<div className="flex min-w-0 flex-col">
							<span className="truncate text-ui">
								{provider.name || provider.id}
							</span>
							<span className="truncate font-mono text-micro text-muted-foreground">
								{provider.baseUrl}
							</span>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("codexCustom.editAria", { id: provider.id })}
								onClick={() => startEdit(provider)}
							>
								<Pencil className="size-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("codexCustom.deleteAria", { id: provider.id })}
								disabled={deleteMutation.isPending}
								onClick={() => deleteMutation.mutate(provider.id)}
							>
								<Trash2 className="size-4" />
							</Button>
						</div>
					</div>
				))
			)}
			<div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						setError(null);
						setDraft({ ...EMPTY_DRAFT });
					}}
				>
					<Plus className="size-4" />
					{t("actions.addProvider")}
				</Button>
			</div>
		</div>
	);
}
