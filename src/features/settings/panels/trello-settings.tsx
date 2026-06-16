import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TrelloConnectState } from "@/features/inbox/trello-connect-button";
import { useTrelloConnections } from "@/features/inbox/use-trello-connection";
import {
	type TrelloConnection,
	trelloDisconnect,
	trelloListBoards,
	trelloUpdateScope,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Trello tab content inside Settings → Context.
 *
 *  Lists every connected account; each exposes a My cards/All boards scope
 *  toggle (with a board filter when "All boards"), plus Disconnect. A
 *  "Connect another account" affordance reuses `TrelloConnectState`. */
export function TrelloSettingsPanel() {
	const connectionsQuery = useTrelloConnections();
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
		return <TrelloConnectState className="min-h-[360px]" />;
	}

	return (
		<div className="flex min-h-[360px] w-full flex-col gap-4 px-1 py-2">
			{connections.map((connection) => (
				<TrelloConnectionCard key={connection.id} connection={connection} />
			))}
			{showConnectAnother ? (
				<div className="rounded-lg border border-border/60 p-2">
					<TrelloConnectState
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
					Connect another account
				</Button>
			)}
		</div>
	);
}

function TrelloConnectionCard({
	connection,
}: {
	connection: TrelloConnection;
}) {
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	// Local mirror so the controls stay responsive while the persist + cache
	// invalidation round-trips. Seeded from the persisted connection.
	const [assignedOnly, setAssignedOnly] = useState<boolean>(
		connection.assignedOnly,
	);
	const [boardIds, setBoardIds] = useState<string[]>(connection.boardIds);

	const updateMutation = useMutation({
		mutationFn: trelloUpdateScope,
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Couldn't save Trello scope.";
			pushToast(message, "Trello update failed", "destructive");
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => trelloDisconnect(connection.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.trelloConnections,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Couldn't disconnect Trello.";
			pushToast(message, "Trello disconnect failed", "destructive");
		},
	});

	const persist = (next: { assignedOnly: boolean; boardIds: string[] }) => {
		updateMutation.mutate({ connectionId: connection.id, ...next });
	};

	const handleScope = (value: string) => {
		if (value !== "assigned" && value !== "all") return;
		const nextAssignedOnly = value === "assigned";
		setAssignedOnly(nextAssignedOnly);
		// Switching back to "My cards" clears the board filter server-side;
		// mirror that.
		if (nextAssignedOnly) {
			setBoardIds([]);
		}
		persist({
			assignedOnly: nextAssignedOnly,
			boardIds: nextAssignedOnly ? [] : boardIds,
		});
	};

	const toggleBoard = (id: string) => {
		const next = boardIds.includes(id)
			? boardIds.filter((b) => b !== id)
			: [...boardIds, id];
		setBoardIds(next);
		persist({ assignedOnly, boardIds: next });
	};

	const member = connection.memberName?.trim();

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{member || "Trello account"}
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="cursor-interactive shrink-0 text-small"
					onClick={() => disconnectMutation.mutate()}
					disabled={disconnectMutation.isPending}
				>
					{disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
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
						My cards
					</ToggleGroupItem>
					<ToggleGroupItem value="all" className="cursor-interactive">
						All boards
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{!assignedOnly ? (
				<BoardPicker
					connectionId={connection.id}
					boardIds={boardIds}
					onToggleBoard={toggleBoard}
				/>
			) : (
				<p className="text-mini text-muted-foreground/65">
					Only cards you're a member of appear in the feed.
				</p>
			)}
		</div>
	);
}

function BoardPicker({
	connectionId,
	boardIds,
	onToggleBoard,
}: {
	connectionId: string;
	boardIds: string[];
	onToggleBoard: (id: string) => void;
}) {
	const boardsQuery = useQuery({
		queryKey: grexQueryKeys.trelloBoards(connectionId),
		queryFn: () => trelloListBoards(connectionId),
		staleTime: 5 * 60_000,
	});

	return (
		<CheckboxList
			label="Boards"
			emptyHint="All boards"
			isLoading={boardsQuery.isLoading}
			options={(boardsQuery.data ?? []).map((b) => ({
				id: b.id,
				label: b.name,
			}))}
			selected={boardIds}
			onToggle={onToggleBoard}
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
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between">
				<span className="text-mini font-medium text-foreground">{label}</span>
				<span className="text-mini text-muted-foreground/55">
					{selected.length === 0 ? emptyHint : `${selected.length} selected`}
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
							Nothing to filter.
						</div>
					) : (
						options.map((option) => {
							const checkboxId = `trello-filter-${option.id}`;
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
