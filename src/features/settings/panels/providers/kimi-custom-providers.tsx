import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	deleteKimiCustomProvider,
	getKimiCustomProviders,
	type KimiCustomModel,
	type KimiCustomProvider,
	upsertKimiCustomProvider,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";

// Kimi provider `type` values the unified card supports. MUST stay in sync with
// `KIMI_WIRE_TYPES` in src-tauri/src/agents/kimi_config.rs.
const KIMI_API_STYLES: ReadonlyArray<{
	value: string;
	label: string;
	hint: string;
}> = [
	{
		value: "openai",
		label: "OpenAI-compatible",
		hint: "GET {base}/models · Authorization: Bearer. Base URL includes /v1.",
	},
	{
		value: "openai_responses",
		label: "OpenAI Responses",
		hint: "OpenAI Responses API (/v1/responses).",
	},
	{
		value: "anthropic",
		label: "Anthropic",
		hint: "GET {base}/v1/models · x-api-key / anthropic-version.",
	},
	{
		value: "kimi",
		label: "Kimi (Moonshot)",
		hint: "Moonshot's OpenAI-shaped API.",
	},
];

type CustomDraft = {
	/** Original id when editing; a rename deletes the old block. */
	originalId: string | null;
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	apiStyle: string;
	models: KimiCustomModel[];
};

const EMPTY_CUSTOM: CustomDraft = {
	originalId: null,
	id: "",
	name: "",
	baseUrl: "",
	apiKey: "",
	apiStyle: "openai",
	models: [],
};

// Signature of user-editable fields, for skipping no-op saves.
function customSig(p: {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	apiStyle: string;
	models: KimiCustomModel[];
}): string {
	return JSON.stringify({
		id: p.id.trim(),
		name: p.name.trim(),
		baseUrl: p.baseUrl.trim(),
		apiKey: p.apiKey.trim(),
		apiStyle: p.apiStyle,
		models: p.models
			.filter((m) => m.slug.trim())
			.map((m) => ({ slug: m.slug.trim(), label: m.label.trim() })),
	});
}

function slugifyId(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32)
		.replace(/-+$/g, "");
}

function hostFromUrl(url: string): string {
	const trimmed = url.trim();
	try {
		return new URL(trimmed).hostname;
	} catch {
		// retry assuming a missing scheme
	}
	try {
		return new URL(`https://${trimmed}`).hostname;
	} catch {
		return "";
	}
}

// Auto-derive a provider id (the `[providers.<id>]` config key).
function generateProviderId(
	name: string,
	baseUrl: string,
	taken: ReadonlySet<string>,
): string {
	const base = slugifyId(name) || slugifyId(hostFromUrl(baseUrl)) || "custom";
	if (!taken.has(base)) return base;
	for (let n = 2; n < 1000; n++) {
		if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
	}
	return `${base}-${taken.size + 1}`;
}

/** Add/edit OpenAI-compatible (or Anthropic-shaped) endpoints in the user's
 *  global `~/.kimi-code/config.toml`. Saves on blur; `onChanged` re-syncs the
 *  composer picker so newly-added models show up. */
export function KimiCustomProvidersPanel({
	onChanged,
}: {
	onChanged?: () => void;
}) {
	const queryClient = useQueryClient();
	const providersQuery = useQuery({
		queryKey: grexQueryKeys.kimiCustomProviders,
		queryFn: getKimiCustomProviders,
	});
	const providers = useMemo(
		() => providersQuery.data ?? [],
		[providersQuery.data],
	);
	const configuredById = useMemo(
		() => new Map(providers.map((p) => [p.id, p])),
		[providers],
	);

	const [custom, setCustom] = useState<CustomDraft>(EMPTY_CUSTOM);
	const [error, setError] = useState<string | null>(null);

	const afterWrite = () => {
		void queryClient.invalidateQueries({
			queryKey: grexQueryKeys.kimiCustomProviders,
		});
		onChanged?.();
	};

	const saveMutation = useMutation({
		mutationFn: async (input: {
			provider: KimiCustomProvider;
			originalId: string | null;
		}) => {
			if (input.originalId && input.originalId !== input.provider.id) {
				await deleteKimiCustomProvider(input.originalId);
			}
			await upsertKimiCustomProvider(input.provider);
		},
		onSuccess: (_data, input) => {
			setError(null);
			setCustom((c) => ({ ...c, originalId: input.provider.id }));
			afterWrite();
		},
		onError: (e) => setError(e instanceof Error ? e.message : String(e)),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteKimiCustomProvider(id),
		onSuccess: () => {
			setError(null);
			if (custom.originalId) setCustom(EMPTY_CUSTOM);
			afterWrite();
		},
		onError: (e) => setError(e instanceof Error ? e.message : String(e)),
	});

	function editProvider(provider: KimiCustomProvider) {
		setError(null);
		setCustom({
			originalId: provider.id,
			id: provider.id,
			name: provider.name,
			baseUrl: provider.baseUrl,
			apiKey: provider.apiKey,
			apiStyle: provider.apiStyle ?? "openai",
			models: provider.models.map((m) => ({ ...m })),
		});
	}

	function commitDraft(draft: CustomDraft) {
		// Tolerate an incomplete draft (the backend does too) but skip a wholly
		// empty slot so a stray blur can't write a blank provider.
		if (!draft.baseUrl.trim() && !draft.name.trim()) return;
		const taken = new Set<string>(providers.map((p) => p.id));
		if (draft.originalId) taken.delete(draft.originalId);
		const id =
			draft.originalId ?? generateProviderId(draft.name, draft.baseUrl, taken);
		const existing = configuredById.get(id);
		if (
			existing &&
			draft.originalId === existing.id &&
			customSig({ ...draft, id }) ===
				customSig({ ...existing, apiStyle: existing.apiStyle ?? "openai" })
		) {
			return;
		}
		saveMutation.mutate({
			originalId: draft.originalId,
			provider: {
				id,
				name: draft.name.trim() || hostFromUrl(draft.baseUrl) || id,
				baseUrl: draft.baseUrl.trim(),
				apiKey: draft.apiKey.trim(),
				apiStyle: draft.apiStyle,
				models: draft.models
					.filter((m) => m.slug.trim())
					.map((m) => ({
						slug: m.slug.trim(),
						label: m.label.trim() || m.slug.trim(),
						effortLevels: m.effortLevels ?? [],
					})),
			},
		});
	}

	const commitCustom = () => commitDraft(custom);

	function pickApiStyle(apiStyle: string) {
		setCustom((c) => ({ ...c, apiStyle }));
		commitDraft({ ...custom, apiStyle });
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="grid gap-2">
				<Input
					value={custom.name}
					onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))}
					onBlur={commitCustom}
					placeholder="Display name (e.g. My Proxy)"
					className="h-8 border-border/50 bg-muted/20 text-ui"
				/>
				<Input
					value={custom.baseUrl}
					onChange={(e) =>
						setCustom((c) => ({ ...c, baseUrl: e.target.value }))
					}
					onBlur={commitCustom}
					placeholder="Base URL (https://…/v1)"
					className="h-8 border-border/50 bg-muted/20 text-ui"
				/>
				<Input
					type="password"
					value={custom.apiKey}
					onChange={(e) => setCustom((c) => ({ ...c, apiKey: e.target.value }))}
					onBlur={commitCustom}
					placeholder="API key"
					className="h-8 border-border/50 bg-muted/20 text-ui"
				/>
				<ApiStyleSelect value={custom.apiStyle} onChange={pickApiStyle} />
				<ModelsEditor
					models={custom.models}
					onChange={(models) => setCustom((c) => ({ ...c, models }))}
					onCommit={commitCustom}
				/>
				{custom.originalId ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							setError(null);
							setCustom(EMPTY_CUSTOM);
						}}
						className="justify-self-start text-muted-foreground"
					>
						<Plus className="size-3.5" />
						New provider
					</Button>
				) : null}

				{error ? (
					<p className="text-small leading-snug text-destructive">{error}</p>
				) : null}
			</div>

			<ConfiguredList
				providers={providers}
				editingId={custom.originalId}
				onEdit={editProvider}
				onDelete={(id) => deleteMutation.mutate(id)}
			/>
		</div>
	);
}

function ApiStyleSelect({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const current =
		KIMI_API_STYLES.find((s) => s.value === value) ?? KIMI_API_STYLES[0];
	return (
		<div className="grid gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger className="flex h-8 cursor-interactive items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 text-ui text-foreground hover:bg-muted/40">
					<span className="flex min-w-0 items-center gap-2">
						<span className="text-muted-foreground">API style</span>
						<span className="truncate">{current.label}</span>
					</span>
					<ChevronDown className="size-3 shrink-0 opacity-40" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-[340px]">
					{KIMI_API_STYLES.map((style) => (
						<DropdownMenuItem
							key={style.value}
							onClick={() => onChange(style.value)}
							className="flex flex-col items-start gap-0.5"
						>
							<span className="text-ui text-foreground">{style.label}</span>
							<span className="text-mini text-muted-foreground">
								{style.hint}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<p className="px-1 text-mini leading-snug text-muted-foreground">
				{current.hint}
			</p>
		</div>
	);
}

function ModelsEditor({
	models,
	onChange,
	onCommit,
}: {
	models: KimiCustomModel[];
	onChange: (models: KimiCustomModel[]) => void;
	onCommit: () => void;
}) {
	function update(index: number, patch: Partial<KimiCustomModel>) {
		onChange(models.map((m, i) => (i === index ? { ...m, ...patch } : m)));
	}
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border/40 p-2">
			<div className="px-1 text-mini font-medium text-muted-foreground">
				Models
			</div>
			{models.length === 0 ? (
				<div className="px-1 pb-1 text-small text-muted-foreground">
					No models yet — add the model ids your endpoint serves.
				</div>
			) : null}
			{models.map((model, index) => (
				<div
					key={index}
					className="flex flex-col gap-1.5 rounded-md bg-muted/20 p-2"
				>
					<div className="flex items-center gap-2">
						<Input
							value={model.slug}
							onChange={(e) => update(index, { slug: e.target.value })}
							onBlur={onCommit}
							placeholder="model-id"
							className="h-7 min-w-0 flex-1 border-border/50 bg-background/40 font-mono text-mini"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Remove model"
							onClick={() => {
								onChange(models.filter((_, i) => i !== index));
								onCommit();
							}}
							className="text-muted-foreground hover:text-destructive"
						>
							<X className="size-3.5" />
						</Button>
					</div>
					<Input
						value={model.label}
						onChange={(e) => update(index, { label: e.target.value })}
						onBlur={onCommit}
						placeholder="Display name (optional)"
						className="h-7 border-border/50 bg-background/40 text-mini"
					/>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() =>
					onChange([...models, { slug: "", label: "", effortLevels: [] }])
				}
			>
				<Plus className="size-3.5" />
				Add model
			</Button>
		</div>
	);
}

function ConfiguredList({
	providers,
	editingId,
	onEdit,
	onDelete,
}: {
	providers: KimiCustomProvider[];
	editingId: string | null;
	onEdit: (provider: KimiCustomProvider) => void;
	onDelete: (id: string) => void;
}) {
	if (providers.length === 0) {
		return (
			<div className="text-small text-muted-foreground">
				No custom providers configured.
			</div>
		);
	}
	return (
		<div className="flex flex-col divide-y divide-border/30 rounded-lg border border-border/40">
			{providers.map((provider) => {
				const detail = `${provider.baseUrl || "no base URL"} · ${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`;
				return (
					<div
						key={provider.id}
						className={cn(
							"flex items-center gap-2 px-2.5 py-2",
							editingId === provider.id && "bg-muted/30",
						)}
					>
						<div className="flex size-4 shrink-0 items-center justify-center">
							<Box className="size-4 text-muted-foreground" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-ui font-medium text-foreground">
								{provider.name || provider.id}
							</div>
							<div className="truncate font-mono text-mini text-muted-foreground">
								{detail}
							</div>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={`Edit ${provider.id}`}
							onClick={() => onEdit(provider)}
							className="text-muted-foreground hover:text-foreground"
						>
							<Pencil className="size-3.5" strokeWidth={1.8} />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={`Delete ${provider.id}`}
							onClick={() => onDelete(provider.id)}
							className="text-muted-foreground hover:text-destructive"
						>
							<Trash2 className="size-3.5" strokeWidth={1.8} />
						</Button>
					</div>
				);
			})}
		</div>
	);
}
