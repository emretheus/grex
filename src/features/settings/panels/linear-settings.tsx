import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LinearConnectState } from "@/features/inbox/linear-connect-button";
import { useLinearConnections } from "@/features/inbox/use-linear-connection";
import {
	type LinearConnection,
	type LinearScope,
	linearDisconnect,
	linearListProjects,
	linearListTeams,
	linearUpdateScope,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Linear tab content inside Settings → Context.
 *
 *  Lists every connected workspace; each exposes an Assigned/All scope
 *  toggle (with team + project filters when "All"), plus Disconnect. A
 *  "Connect another workspace" affordance reuses `LinearConnectState`. */
export function LinearSettingsPanel() {
	const { t } = useTranslation("integrations");
	const connectionsQuery = useLinearConnections();
	const connections = connectionsQuery.data ?? [];
	const [showConnectAnother, setShowConnectAnother] = useState(false);

	if (connectionsQuery.isLoading) {
		return (
			<div className="flex min-h-[360px] w-full items-center justify-center text-muted-foreground/70">
				<Loader2 className="size-4 animate-spin" strokeWidth={2} />
			</div>
		);
	}

	if (connections.length === 0) {
		return <LinearConnectState className="min-h-[360px]" />;
	}

	return (
		<div className="flex min-h-[360px] w-full flex-col gap-4 px-1 py-2">
			{connections.map((connection) => (
				<LinearConnectionCard key={connection.id} connection={connection} />
			))}
			{showConnectAnother ? (
				<div className="rounded-lg border border-border/60 p-2">
					<LinearConnectState
						className="min-h-[280px]"
						onConnected={() => setShowConnectAnother(false)}
					/>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="cursor-interactive self-center text-small"
					onClick={() => setShowConnectAnother(true)}
				>
					<Plus className="size-3.5" strokeWidth={2} />
					{t("linear.connectAnother")}
				</Button>
			)}
		</div>
	);
}

function LinearConnectionCard({
	connection,
}: {
	connection: LinearConnection;
}) {
	const { t } = useTranslation("integrations");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	// Local mirror so the controls stay responsive while the persist + cache
	// invalidation round-trips. Seeded from the persisted connection.
	const [scope, setScope] = useState<LinearScope>(connection.scope);
	const [teamIds, setTeamIds] = useState<string[]>(connection.teamIds);
	const [projectIds, setProjectIds] = useState<string[]>(connection.projectIds);

	const updateMutation = useMutation({
		mutationFn: linearUpdateScope,
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : t("linear.updateError");
			pushToast(message, t("linear.updateFailed"), "destructive");
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => linearDisconnect(connection.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.linearConnections,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : t("linear.disconnectError");
			pushToast(message, t("linear.disconnectFailed"), "destructive");
		},
	});

	const persist = (next: {
		scope: LinearScope;
		teamIds: string[];
		projectIds: string[];
	}) => {
		updateMutation.mutate({ connectionId: connection.id, ...next });
	};

	const handleScope = (value: string) => {
		if (value !== "assigned" && value !== "all") return;
		setScope(value);
		// Switching back to "assigned" clears filters server-side; mirror that.
		if (value === "assigned") {
			setTeamIds([]);
			setProjectIds([]);
		}
		persist({
			scope: value,
			teamIds: value === "assigned" ? [] : teamIds,
			projectIds: value === "assigned" ? [] : projectIds,
		});
	};

	const toggleTeam = (id: string) => {
		const next = teamIds.includes(id)
			? teamIds.filter((t) => t !== id)
			: [...teamIds, id];
		setTeamIds(next);
		persist({ scope, teamIds: next, projectIds });
	};

	const toggleProject = (id: string) => {
		const next = projectIds.includes(id)
			? projectIds.filter((p) => p !== id)
			: [...projectIds, id];
		setProjectIds(next);
		persist({ scope, teamIds, projectIds: next });
	};

	const workspace = connection.workspaceName?.trim();
	const user = connection.userName?.trim();

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{workspace || t("linear.workspaceFallback")}
					</div>
					{user ? (
						<div className="truncate text-mini text-muted-foreground/70">
							{user}
						</div>
					) : null}
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="cursor-interactive shrink-0 text-small"
					onClick={() => disconnectMutation.mutate()}
					disabled={disconnectMutation.isPending}
				>
					{disconnectMutation.isPending
						? t("common.disconnecting")
						: t("common.disconnect")}
				</Button>
			</div>

			<div className="flex items-center gap-2">
				<ToggleGroup
					type="single"
					value={scope}
					onValueChange={handleScope}
					variant="outline"
					size="sm"
				>
					<ToggleGroupItem value="assigned" className="cursor-interactive">
						{t("scope.assignedToMe")}
					</ToggleGroupItem>
					<ToggleGroupItem value="all" className="cursor-interactive">
						{t("linear.scopeAll")}
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{scope === "all" ? (
				<FilterPickers
					connectionId={connection.id}
					teamIds={teamIds}
					projectIds={projectIds}
					onToggleTeam={toggleTeam}
					onToggleProject={toggleProject}
				/>
			) : (
				<p className="text-mini text-muted-foreground/65">
					{t("common.assignedFeedHint")}
				</p>
			)}
		</div>
	);
}

function FilterPickers({
	connectionId,
	teamIds,
	projectIds,
	onToggleTeam,
	onToggleProject,
}: {
	connectionId: string;
	teamIds: string[];
	projectIds: string[];
	onToggleTeam: (id: string) => void;
	onToggleProject: (id: string) => void;
}) {
	const { t } = useTranslation("integrations");
	const teamsQuery = useQuery({
		queryKey: grexQueryKeys.linearTeams(connectionId),
		queryFn: () => linearListTeams(connectionId),
		staleTime: 5 * 60_000,
	});
	const projectsQuery = useQuery({
		queryKey: grexQueryKeys.linearProjects(connectionId, null),
		queryFn: () => linearListProjects({ connectionId }),
		staleTime: 5 * 60_000,
	});

	return (
		<div className="grid grid-cols-2 gap-3">
			<CheckboxList
				label={t("linear.teamsLabel")}
				emptyHint={t("linear.allTeams")}
				isLoading={teamsQuery.isLoading}
				options={(teamsQuery.data ?? []).map((t) => ({
					id: t.id,
					label: `${t.key} · ${t.name}`,
				}))}
				selected={teamIds}
				onToggle={onToggleTeam}
			/>
			<CheckboxList
				label={t("linear.projectsLabel")}
				emptyHint={t("linear.allProjects")}
				isLoading={projectsQuery.isLoading}
				options={(projectsQuery.data ?? []).map((p) => ({
					id: p.id,
					label: p.name,
				}))}
				selected={projectIds}
				onToggle={onToggleProject}
			/>
		</div>
	);
}

function CheckboxList({
	label,
	emptyHint,
	isLoading,
	options,
	selected,
	onToggle,
}: {
	label: string;
	emptyHint: string;
	isLoading: boolean;
	options: { id: string; label: string }[];
	selected: string[];
	onToggle: (id: string) => void;
}) {
	const { t } = useTranslation("integrations");
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between">
				<span className="text-mini font-medium text-foreground">{label}</span>
				<span className="text-mini text-muted-foreground/55">
					{selected.length === 0
						? emptyHint
						: t("common.countSelected", { count: selected.length })}
				</span>
			</div>
			<ScrollArea className="h-32 rounded-md border border-border/50">
				<div className="flex flex-col gap-1 p-2">
					{isLoading ? (
						<div className="flex items-center justify-center py-4 text-muted-foreground/60">
							<Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
						</div>
					) : options.length === 0 ? (
						<div className="px-1 py-2 text-mini text-muted-foreground/60">
							{t("common.nothingToFilter")}
						</div>
					) : (
						options.map((option) => {
							const checkboxId = `linear-filter-${option.id}`;
							return (
								<label
									key={option.id}
									htmlFor={checkboxId}
									className="flex cursor-interactive items-center gap-2 rounded px-1 py-0.5 text-small text-foreground hover:bg-foreground/5"
								>
									<Checkbox
										id={checkboxId}
										checked={selected.includes(option.id)}
										onCheckedChange={() => onToggle(option.id)}
									/>
									<span className="truncate">{option.label}</span>
								</label>
							);
						})
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
