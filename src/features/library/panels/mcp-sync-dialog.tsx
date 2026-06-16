import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	type McpAgentSyncChange,
	previewMcpSync,
	syncMcpServers,
} from "@/lib/api";
import { mcpAgentLabel } from "../mcp-agents";

function isNoop(change: McpAgentSyncChange): boolean {
	return change.written.length === 0 && change.removed.length === 0;
}

/**
 * "Sync to agents" confirmation. Shows a per-agent preview of exactly which
 * native config files change before the user commits — the explicit,
 * no-surprises write that defines Grex's Library sync model.
 */
export function McpSyncDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const preview = useQuery({
		queryKey: ["libraryMcpSyncPreview"],
		queryFn: previewMcpSync,
		enabled: open,
		gcTime: 0,
		staleTime: 0,
	});

	const sync = useMutation({
		mutationFn: syncMcpServers,
		onSuccess: () => onOpenChange(false),
	});

	const changes = preview.data?.changes ?? [];
	const hasWork = changes.some((c) => !isNoop(c));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>Sync MCP servers to agents</DialogTitle>
					<DialogDescription>
						Grex will write these changes to each agent's native config file.
						Unrelated entries are left untouched.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[320px] space-y-4 overflow-y-auto py-1">
					{preview.isLoading ? (
						<p className="text-small text-muted-foreground">
							Computing changes…
						</p>
					) : changes.length === 0 ? (
						<p className="text-small text-muted-foreground">
							No agents available.
						</p>
					) : (
						changes.map((change) => (
							<div key={change.agent} className="space-y-1.5">
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-ui font-medium text-foreground">
										{mcpAgentLabel(change.agent)}
									</span>
									<span className="truncate font-mono text-nano text-muted-foreground">
										{change.configPath}
									</span>
								</div>
								{isNoop(change) && change.unsupported.length === 0 ? (
									<p className="text-small text-muted-foreground">
										No changes.
									</p>
								) : (
									<ul className="space-y-0.5">
										{change.written.map((name) => (
											<ChangeRow key={`w-${name}`} icon={Plus} tone="add">
												{name}
											</ChangeRow>
										))}
										{change.removed.map((name) => (
											<ChangeRow key={`r-${name}`} icon={Minus} tone="remove">
												{name}
											</ChangeRow>
										))}
										{change.unsupported.map((name) => (
											<ChangeRow
												key={`u-${name}`}
												icon={TriangleAlert}
												tone="warn"
											>
												{name} — not supported by this agent, skipped
											</ChangeRow>
										))}
									</ul>
								)}
							</div>
						))
					)}
				</div>

				{sync.isError ? (
					<p className="text-small text-destructive">
						Sync failed. Your config files were not changed.
					</p>
				) : null}

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={!hasWork || sync.isPending || preview.isLoading}
						onClick={() => sync.mutate()}
					>
						<ArrowRight className="size-4" />
						Sync now
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ChangeRow({
	icon: Icon,
	tone,
	children,
}: {
	icon: typeof Plus;
	tone: "add" | "remove" | "warn";
	children: React.ReactNode;
}) {
	const color =
		tone === "add"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "remove"
				? "text-destructive"
				: "text-amber-600 dark:text-amber-400";
	return (
		<li className="flex items-center gap-2 text-small">
			<Icon className={`size-3.5 shrink-0 ${color}`} />
			<span className="font-mono text-foreground">{children}</span>
		</li>
	);
}
