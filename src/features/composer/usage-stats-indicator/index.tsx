import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ClaudeIcon, OpenAIIcon } from "@/components/icons";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	claudeRateLimitsQueryOptions,
	codexRateLimitsQueryOptions,
	grexQueryKeys,
} from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
	parseClaudeRateLimits,
	parseCodexRateLimits,
	type RateLimitWindowDisplay,
	ringTier,
} from "../context-usage-ring/parse";
import { LimitRow } from "../context-usage-ring/popover-parts";

type Props = {
	agentType: "claude" | "codex" | "cursor" | "opencode" | null;
	disabled?: boolean;
	className?: string;
};

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 80;

export function UsageStatsIndicator({ agentType, disabled, className }: Props) {
	const { settings, updateSettings } = useSettings();
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const show =
		settings.showUsageStats &&
		(agentType === "claude" || agentType === "codex");

	const { data: codexRaw = null } = useQuery(
		codexRateLimitsQueryOptions(show && !disabled && agentType === "codex"),
	);
	const { data: claudeRaw = null } = useQuery(
		claudeRateLimitsQueryOptions(show && !disabled && agentType === "claude"),
	);

	// Refresh on hover open. The Rust 30 s throttle keeps this from
	// hammering upstream — within the throttle window the command just
	// returns the cached body — so this can fire as eagerly as the user
	// opens the popover.
	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (!next || disabled) return;
			const key =
				agentType === "claude"
					? grexQueryKeys.claudeRateLimits
					: agentType === "codex"
						? grexQueryKeys.codexRateLimits
						: null;
			if (key) {
				void queryClient.refetchQueries({ queryKey: key });
			}
		},
		[agentType, disabled, queryClient],
	);

	const stats = useMemo(() => {
		if (agentType === "claude") return parseClaudeRateLimits(claudeRaw);
		if (agentType === "codex") return parseCodexRateLimits(codexRaw);
		return null;
	}, [agentType, claudeRaw, codexRaw]);

	if (!show || !stats) return null;
	if (
		!stats.primary &&
		!stats.secondary &&
		stats.extraWindows.length === 0 &&
		stats.notes.length === 0
	) {
		return null;
	}

	return (
		<HoverCard
			open={open}
			onOpenChange={handleOpenChange}
			openDelay={HOVER_OPEN_DELAY_MS}
			closeDelay={HOVER_CLOSE_DELAY_MS}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label="Usage Stats"
					className={cn(
						"flex size-7 cursor-interactive items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					<UsageStatsGlyph
						primary={stats.primary}
						secondary={stats.secondary}
					/>
				</button>
			</HoverCardTrigger>
			<HoverCardContent side="top" align="end" className="w-[280px]">
				<div className="flex flex-col gap-3 px-1 py-1">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span
								className="text-muted-foreground"
								aria-label={agentType === "claude" ? "Claude" : "Codex"}
							>
								{agentType === "claude" ? (
									<ClaudeIcon className="size-[13px]" />
								) : (
									<OpenAIIcon className="size-[13px]" />
								)}
							</span>
							<TooltipProvider delayDuration={300}>
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="text-body font-semibold text-foreground cursor-help">
											Usage Stats
										</div>
									</TooltipTrigger>
									<TooltipContent
										side="top"
										align="start"
										className="max-w-[200px] bg-popover text-popover-foreground border border-border"
									>
										<p>API rate limit usage statistics</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<div className="flex items-center gap-3">
							<TooltipProvider delayDuration={300}>
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="cursor-help">
											<ToggleGroup
												type="single"
												value={settings.usageStatsDisplayMode}
												className="rounded-md bg-muted p-0.5"
												onValueChange={(value: string) => {
													if (value)
														updateSettings({
															usageStatsDisplayMode: value as "left" | "used",
														});
												}}
											>
												<ToggleGroupItem
													value="left"
													className="h-5 rounded-sm px-1.5 text-nano font-medium data-[state=off]:text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
												>
													Leftover
												</ToggleGroupItem>
												<ToggleGroupItem
													value="used"
													className="h-5 rounded-sm px-1.5 text-nano font-medium data-[state=off]:text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
												>
													Used
												</ToggleGroupItem>
											</ToggleGroup>
										</div>
									</TooltipTrigger>
									<TooltipContent
										side="top"
										align="end"
										className="max-w-[220px] bg-popover text-popover-foreground border border-border"
									>
										<p>
											Toggle between remaining (Leftover) or consumed (Used)
											percentage display
										</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
					{stats.primary || stats.secondary || stats.extraWindows.length > 0 ? (
						<div className="flex flex-col gap-2.5">
							{stats.primary ? (
								<LimitRow
									window={stats.primary}
									displayMode={settings.usageStatsDisplayMode}
								/>
							) : null}
							{stats.secondary ? (
								<LimitRow
									window={stats.secondary}
									displayMode={settings.usageStatsDisplayMode}
								/>
							) : null}
							{stats.extraWindows.map((entry) => (
								<LimitRow
									key={entry.id}
									window={{ ...entry.window, label: entry.title }}
									displayMode={settings.usageStatsDisplayMode}
								/>
							))}
						</div>
					) : null}
					{stats.notes.length > 0 ? (
						<div className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5">
							{stats.notes.map((note) => (
								<div
									key={note.label}
									className="flex items-center justify-between text-small"
								>
									<span className="text-muted-foreground">{note.label}</span>
									<span className="font-medium tabular-nums text-foreground">
										{note.value}
									</span>
								</div>
							))}
						</div>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

// Geometry mirrors CodexBar's menu-bar IconRenderer so this indicator
// reads with the same visual weight users get from the system menu
// equivalent: 15 pt-wide track, 6 pt top bar, 4 pt bottom bar, 3 pt
// gap. The wrapper is `flex flex-col` rather than a fixed-size box, so
// the 28 pt button host (`size-7`) handles centering — the bars
// themselves stay tight against each other. Each fill colors
// independently by its own usedPercent tier.
const GLYPH_TRACK_WIDTH = 15;
const GLYPH_PRIMARY_HEIGHT = 6;
const GLYPH_SECONDARY_HEIGHT = 4;
const GLYPH_GAP = 3;

function UsageStatsGlyph({
	primary,
	secondary,
}: {
	primary: RateLimitWindowDisplay | null;
	secondary: RateLimitWindowDisplay | null;
}) {
	return (
		<div
			className="flex flex-col items-start justify-center"
			style={{ gap: GLYPH_GAP }}
			aria-hidden
		>
			<GlyphBar window={primary} height={GLYPH_PRIMARY_HEIGHT} />
			<GlyphBar window={secondary} height={GLYPH_SECONDARY_HEIGHT} />
		</div>
	);
}

function GlyphBar({
	window,
	height,
}: {
	window: RateLimitWindowDisplay | null;
	height: number;
}) {
	// Render the *remaining* fraction so the icon and popover read the
	// same way: longer bar = more headroom. Tier still tracks
	// `usedPercent` so a near-empty bar lights up amber/destructive.
	const used = window?.usedPercent ?? 0;
	const left = window ? window.leftPercent : 0;
	const tier = ringTier(used);
	const fillClass =
		tier === "danger"
			? "bg-destructive"
			: tier === "warning"
				? "bg-amber-500"
				: window
					? "bg-foreground/65"
					: "bg-foreground/35";
	return (
		<div
			className="overflow-hidden rounded-full bg-muted"
			style={{ width: GLYPH_TRACK_WIDTH, height }}
		>
			<div
				className={cn("h-full rounded-full transition-[width]", fillClass)}
				style={{ width: `${left}%` }}
			/>
		</div>
	);
}
