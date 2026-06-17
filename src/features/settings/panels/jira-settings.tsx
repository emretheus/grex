import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { JiraConnectState } from "@/features/inbox/jira-connect-button";
import { useJiraConnections } from "@/features/inbox/use-jira-connection";
import {
	type JiraConnection,
	jiraDisconnect,
	jiraListProjects,
	jiraUpdateScope,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Jira tab content inside Settings → Context.
 *
 *  Lists every connected site; each exposes an Assigned/All scope toggle
 *  (with a project filter when "All"), plus Disconnect. A "Connect another
 *  site" affordance reuses `JiraConnectState`. */
export function JiraSettingsPanel() {
	const { t } = useTranslation("integrations");
	const connectionsQuery = useJiraConnections();
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
		return <JiraConnectState className="min-h-[360px]" />;
	}

	return (
		<div className="flex min-h-[360px] w-full flex-col gap-4 px-1 py-2">
			{connections.map((connection) => (
				<JiraConnectionCard key={connection.id} connection={connection} />
			))}
			{showConnectAnother ? (
				<div className="rounded-lg border border-border/60 p-2">
					<JiraConnectState
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
					{t("jira.connectAnother")}
				</Button>
			)}
		</div>
	);
}

function JiraConnectionCard({ connection }: { connection: JiraConnection }) {
	const { t } = useTranslation("integrations");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	// Local mirror so the controls stay responsive while the persist + cache
	// invalidation round-trips. Seeded from the persisted connection.
	const [assignedOnly, setAssignedOnly] = useState<boolean>(
		connection.assignedOnly,
	);
	const [projectKeys, setProjectKeys] = useState<string[]>(
		connection.projectKeys,
	);

	const updateMutation = useMutation({
		mutationFn: jiraUpdateScope,
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : t("jira.updateError");
			pushToast(message, t("jira.updateFailed"), "destructive");
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => jiraDisconnect(connection.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.jiraConnections,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : t("jira.disconnectError");
			pushToast(message, t("jira.disconnectFailed"), "destructive");
		},
	});

	const persist = (next: { assignedOnly: boolean; projectKeys: string[] }) => {
		updateMutation.mutate({ connectionId: connection.id, ...next });
	};

	const handleScope = (value: string) => {
		if (value !== "assigned" && value !== "all") return;
		const nextAssignedOnly = value === "assigned";
		setAssignedOnly(nextAssignedOnly);
		// Switching back to "assigned" clears filters server-side; mirror that.
		if (nextAssignedOnly) {
			setProjectKeys([]);
		}
		persist({
			assignedOnly: nextAssignedOnly,
			projectKeys: nextAssignedOnly ? [] : projectKeys,
		});
	};

	const toggleProject = (key: string) => {
		const next = projectKeys.includes(key)
			? projectKeys.filter((p) => p !== key)
			: [...projectKeys, key];
		setProjectKeys(next);
		persist({ assignedOnly, projectKeys: next });
	};

	const site = connection.siteName?.trim();
	const user = connection.userName?.trim();

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{site || t("jira.siteFallback")}
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
					value={assignedOnly ? "assigned" : "all"}
					onValueChange={handleScope}
					variant="outline"
					size="sm"
				>
					<ToggleGroupItem value="assigned" className="cursor-interactive">
						{t("scope.assignedToMe")}
					</ToggleGroupItem>
					<ToggleGroupItem value="all" className="cursor-interactive">
						{t("jira.scopeAll")}
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{!assignedOnly ? (
				<ProjectPicker
					connectionId={connection.id}
					projectKeys={projectKeys}
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

function ProjectPicker({
	connectionId,
	projectKeys,
	onToggleProject,
}: {
	connectionId: string;
	projectKeys: string[];
	onToggleProject: (key: string) => void;
}) {
	const { t } = useTranslation("integrations");
	const projectsQuery = useQuery({
		queryKey: grexQueryKeys.jiraProjects(connectionId),
		queryFn: () => jiraListProjects(connectionId),
		staleTime: 5 * 60_000,
	});

	return (
		<CheckboxList
			label={t("jira.projectsLabel")}
			emptyHint={t("jira.allProjects")}
			isLoading={projectsQuery.isLoading}
			options={(projectsQuery.data ?? []).map((p) => ({
				id: p.key,
				label: `${p.key} · ${p.name}`,
			}))}
			selected={projectKeys}
			onToggle={onToggleProject}
		/>
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
							const checkboxId = `jira-filter-${option.id}`;
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
