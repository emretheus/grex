import { FolderTree } from "lucide-react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileExplorer } from "./file-explorer";

const EDITOR_CHROME_BACKGROUND_CLASS = "bg-editor-chrome";

export type EditorExplorerLandingProps = {
	workspaceRootPath: string | null;
	/** Opens a file in the editor. Receives an ABSOLUTE path. */
	onOpenFile: (path: string) => void;
	onExit: () => void;
};

/** The "browse the codebase" landing shown when the editor is open but no file
 *  is selected yet (entered via the inspector's "Browse files" affordance).
 *  Renders the same lazy file tree as the in-editor explorer beside an empty
 *  canvas; clicking a file hands an absolute path to `onOpenFile`, which swaps
 *  this landing for the full Monaco editor. */
export function EditorExplorerLanding({
	workspaceRootPath,
	onOpenFile,
	onExit,
}: EditorExplorerLandingProps) {
	const root = workspaceRootPath?.replace(/\/+$/, "") ?? null;

	const handleOpen = (relPath: string) => {
		if (!root) return;
		onOpenFile(`${root}/${relPath}`);
	};

	return (
		<section
			aria-label="File explorer"
			className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
		>
			<div
				className={cn("flex h-9 items-center", EDITOR_CHROME_BACKGROUND_CLASS)}
				data-tauri-drag-region
			>
				<TrafficLightSpacer side="left" width={86} />
				<div
					data-tauri-drag-region
					className="flex min-w-0 flex-1 items-center gap-1.5 text-ui font-medium text-muted-foreground"
				>
					<FolderTree className="size-3.5 shrink-0" strokeWidth={2} />
					<span className="truncate">Files</span>
				</div>
				<div className="flex shrink-0 items-center pr-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onExit}
						aria-label="Close file explorer"
						className="gap-1 px-1.5 text-muted-foreground hover:text-foreground"
					>
						Close
					</Button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1">
				{root ? (
					<FileExplorer
						workspaceRootPath={root}
						selectedRelPath={null}
						onOpenFile={handleOpen}
					/>
				) : null}
				<div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6">
					<div className="flex max-w-xs flex-col items-center gap-2 text-center text-muted-foreground/70">
						<FolderTree
							className="size-6 text-muted-foreground/40"
							strokeWidth={1.6}
						/>
						<div className="text-ui font-medium text-foreground">
							Browse your codebase
						</div>
						<p className="text-pretty text-small leading-5">
							{root
								? "Pick a file from the tree on the left to open it in the editor."
								: "Open a workspace to browse its files."}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
