import { useQuery } from "@tanstack/react-query";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PromptTemplate } from "@/lib/api";
import { libraryPromptsQueryOptions } from "@/lib/query-client";

/**
 * Modal picker for inserting a saved Library prompt into the composer. Opened by
 * the `/prompt` slash command; selecting a prompt hands its text back to the
 * composer, which appends it below any existing content.
 */
export function PromptPickerDialog({
	open,
	onOpenChange,
	onSelect,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (prompt: PromptTemplate) => void;
}) {
	const { data: prompts = [] } = useQuery(libraryPromptsQueryOptions());

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 sm:max-w-[520px]">
				<DialogTitle className="sr-only">Insert a prompt</DialogTitle>
				<Command
					// Match on both title and body so search is useful.
					filter={(value, search) =>
						value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
					}
				>
					<CommandInput placeholder="Insert a prompt…" />
					<CommandList>
						<CommandEmpty>
							{prompts.length === 0
								? "No saved prompts yet. Create one in the Library."
								: "No prompts match your search."}
						</CommandEmpty>
						{prompts.map((prompt) => (
							<CommandItem
								key={prompt.id}
								value={`${prompt.title} ${prompt.prompt}`}
								onSelect={() => {
									onSelect(prompt);
									onOpenChange(false);
								}}
								className="flex flex-col items-start gap-0.5"
							>
								<span className="text-ui font-medium text-foreground">
									{prompt.title}
								</span>
								<span className="line-clamp-1 text-small text-muted-foreground">
									{prompt.prompt}
								</span>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
