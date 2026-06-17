import { Library } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { publishShellEvent, useShellEvent } from "@/shell/event-bus";
import { LibraryMcpPanel } from "./panels/mcp";
import { LibraryPromptsPanel } from "./panels/prompts";
import { LibrarySkillsPanel } from "./panels/skills";
import { LIBRARY_SECTIONS, type LibrarySection } from "./types";

/** Open the Library from anywhere (sidebar button, shortcut, command). */
export function openLibrary(section?: LibrarySection): void {
	publishShellEvent({ type: "open-library", section });
}

/**
 * The Library surface — a Settings-style modal with Prompts / Skills / MCP
 * tabs. Mounted once near the app root; opens in response to the `open-library`
 * shell event so callers don't need to thread open-state through the tree.
 */
export function LibraryDialog() {
	const { t } = useTranslation("library");
	const [open, setOpen] = useState(false);
	const [section, setSection] = useState<LibrarySection>("mcp");

	useShellEvent("open-library", (event) => {
		if (event.section) setSection(event.section);
		setOpen(true);
	});

	// Reset to the default tab whenever the dialog is fully closed.
	useEffect(() => {
		if (!open) setSection("mcp");
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="h-[min(80vh,640px)] w-[min(80vw,860px)] max-w-[860px] overflow-hidden rounded-2xl border-border/60 bg-settings-content p-0 shadow-2xl sm:max-w-[860px]">
				<SidebarProvider className="flex h-full min-h-0 w-full min-w-0 gap-0 overflow-hidden">
					<nav className="scrollbar-stable flex w-[200px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-sidebar-border bg-settings-nav py-6">
						<SidebarGroup>
							<SidebarGroupContent>
								<SidebarMenu>
									{LIBRARY_SECTIONS.map((key) => (
										<SidebarMenuItem key={key}>
											<SidebarMenuButton
												isActive={section === key}
												onClick={() => setSection(key)}
											>
												{t(`sections.${key}.label`)}
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</nav>

					<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
						<div className="flex items-baseline gap-3 border-b border-border/40 px-8 py-4">
							<DialogTitle className="text-title font-semibold text-foreground">
								{t(`sections.${section}.label`)}
							</DialogTitle>
							<DialogDescription className="truncate text-small text-muted-foreground/70">
								{t(`sections.${section}.caption`)}
							</DialogDescription>
						</div>
						<div className="min-h-0 flex-1 overflow-hidden">
							{section === "prompts" ? (
								<LibraryPromptsPanel />
							) : section === "skills" ? (
								<LibrarySkillsPanel />
							) : (
								<LibraryMcpPanel />
							)}
						</div>
					</div>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}

/** Sidebar entry button — opens the Library. Mirrors `SettingsButton`. */
export function LibraryButton({ shortcut }: { shortcut?: string | null }) {
	const { t } = useTranslation("library");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => openLibrary()}
					aria-label={t("openLibrary")}
					className="text-muted-foreground hover:text-foreground"
				>
					<Library className="size-[15px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={4}
				className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
			>
				<span className="leading-none">{t("title")}</span>
				{shortcut ? (
					<InlineShortcutDisplay
						hotkey={shortcut}
						className="text-background/60"
					/>
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}
