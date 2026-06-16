import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	deleteLibraryPrompt,
	type PromptTemplate,
	upsertLibraryPrompt,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";

/**
 * Create / edit form for a single Library prompt. `prompt === null` means a new
 * prompt. Calls `onDone` after a successful save or delete.
 */
export function PromptEditor({
	prompt,
	onDone,
}: {
	prompt: PromptTemplate | null;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState(prompt?.title ?? "");
	const [body, setBody] = useState(prompt?.prompt ?? "");

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: grexQueryKeys.libraryPrompts });

	const save = useMutation({
		mutationFn: () =>
			upsertLibraryPrompt({
				id: prompt?.id ?? null,
				title: title.trim(),
				prompt: body,
			}),
		onSuccess: () => {
			void invalidate();
			onDone();
		},
	});

	const remove = useMutation({
		mutationFn: () => deleteLibraryPrompt(prompt?.id ?? ""),
		onSuccess: () => {
			void invalidate();
			onDone();
		},
	});

	const canSave = title.trim().length > 0 && !save.isPending;

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b border-border/40 px-8 py-3">
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onDone}
					aria-label="Back to prompts"
				>
					<ArrowLeft className="size-4" />
				</Button>
				<span className="text-ui font-medium text-foreground">
					{prompt ? "Edit prompt" : "New prompt"}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{prompt ? (
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground hover:text-destructive"
							disabled={remove.isPending}
							onClick={() => remove.mutate()}
						>
							<Trash2 className="size-4" />
							Delete
						</Button>
					) : null}
					<Button size="sm" disabled={!canSave} onClick={() => save.mutate()}>
						Save
					</Button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-4 px-8 py-5">
				<div className="space-y-1.5">
					<label
						htmlFor="prompt-title"
						className="text-small font-medium text-foreground"
					>
						Title
					</label>
					<Input
						id="prompt-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g. Review carefully"
						autoFocus={!prompt}
					/>
				</div>
				<div className="flex min-h-0 flex-1 flex-col space-y-1.5">
					<label
						htmlFor="prompt-body"
						className="text-small font-medium text-foreground"
					>
						Prompt
					</label>
					<Textarea
						id="prompt-body"
						value={body}
						onChange={(e) => setBody(e.target.value)}
						placeholder="The instructions sent to the agent when you insert this prompt…"
						className="min-h-0 flex-1 resize-none font-mono text-small"
					/>
					<p className="text-nano text-muted-foreground">
						Keep it agent-neutral so it works across every provider.
					</p>
				</div>
				{save.isError ? (
					<p className="text-small text-destructive">
						Couldn't save this prompt. Check the title and try again.
					</p>
				) : null}
			</div>
		</div>
	);
}
