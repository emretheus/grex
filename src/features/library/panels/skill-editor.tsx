import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSkill, deleteSkill, readSkill, updateSkill } from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";

/**
 * Create / edit a skill. For a new skill the user supplies a name + description
 * (the backend generates a starter SKILL.md). Editing exposes the full SKILL.md
 * for direct editing; the name is immutable.
 */
export function SkillEditor({
	skillName,
	onDone,
}: {
	/** `null` ⇒ creating a new skill. */
	skillName: string | null;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const isNew = skillName === null;

	const detail = useQuery({
		queryKey: ["librarySkillDetail", skillName],
		queryFn: () => readSkill(skillName ?? ""),
		enabled: !isNew,
		gcTime: 0,
		staleTime: 0,
	});

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");

	// Load existing content once it arrives.
	useEffect(() => {
		if (detail.data) setContent(detail.data.content);
	}, [detail.data]);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: grexQueryKeys.librarySkills });

	const save = useMutation({
		mutationFn: async () => {
			if (isNew) {
				await createSkill({
					name: name.trim(),
					description: description.trim(),
				});
			} else {
				await updateSkill(skillName, content);
			}
		},
		onSuccess: () => {
			void invalidate();
			onDone();
		},
	});

	const remove = useMutation({
		mutationFn: () => deleteSkill(skillName ?? ""),
		onSuccess: () => {
			void invalidate();
			onDone();
		},
	});

	// Skills installed outside Grex (not in ~/.agentskills) are shown read-only.
	const managed = isNew ? true : (detail.data?.managed ?? true);
	const nameValid = /^[a-z0-9][a-z0-9-]{0,63}$/.test(name.trim());
	const canSave = isNew
		? nameValid && description.trim().length > 0 && !save.isPending
		: managed && content.trim().length > 0 && !save.isPending;

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b border-border/40 px-8 py-3">
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onDone}
					aria-label="Back to skills"
				>
					<ArrowLeft className="size-4" />
				</Button>
				<span className="text-ui font-medium text-foreground">
					{isNew ? "New skill" : skillName}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{!isNew && managed ? (
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
					{managed ? (
						<Button size="sm" disabled={!canSave} onClick={() => save.mutate()}>
							{isNew ? "Create" : "Save"}
						</Button>
					) : (
						<span className="text-small text-muted-foreground">
							Installed outside Grex · read-only
						</span>
					)}
				</div>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-8 py-5">
				{isNew ? (
					<>
						<div className="space-y-1.5">
							<span className="text-small font-medium text-foreground">
								Name
							</span>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. deploy-vercel"
								autoFocus
								className="font-mono text-small"
							/>
							{name.length > 0 && !nameValid ? (
								<p className="text-nano text-destructive">
									Lowercase letters, numbers, and hyphens; start with a letter
									or number.
								</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<span className="text-small font-medium text-foreground">
								Description
							</span>
							<Input
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="What this skill helps the agent do"
							/>
							<p className="text-nano text-muted-foreground">
								Grex generates a starter SKILL.md and links it into your agents.
								You can edit it afterwards.
							</p>
						</div>
					</>
				) : (
					<div className="flex min-h-0 flex-1 flex-col space-y-1.5">
						<span className="text-small font-medium text-foreground">
							SKILL.md
						</span>
						<Textarea
							value={content}
							onChange={(e) => setContent(e.target.value)}
							readOnly={!managed}
							className="min-h-[280px] flex-1 resize-none font-mono text-small"
							spellCheck={false}
						/>
					</div>
				)}
				{save.isError ? (
					<p className="text-small text-destructive">
						Couldn't save this skill. Check the name and try again.
					</p>
				) : null}
			</div>
		</div>
	);
}
