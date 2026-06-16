import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createSkill, type SkillSummary } from "@/lib/api";
import { grexQueryKeys, librarySkillsQueryOptions } from "@/lib/query-client";
import { BrandIcon } from "../mcp-brand-icon";
import {
	SKILLS_CATALOG,
	type SkillCatalogEntry,
	skillCatalogContent,
} from "../skills-catalog";
import { SkillEditor } from "./skill-editor";

function matches(query: string, ...fields: string[]): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return fields.some((f) => f.toLowerCase().includes(q));
}

function iconKeyForSkill(name: string): string | undefined {
	return SKILLS_CATALOG.find((e) => e.key === name)?.iconKey;
}

/** Library → Skills: installed skills + a recommended catalog to install. */
export function LibrarySkillsPanel() {
	const queryClient = useQueryClient();
	const { data: skills = [] } = useQuery(librarySkillsQueryOptions());
	const [editor, setEditor] = useState<{ name: string | null } | null>(null);
	const [search, setSearch] = useState("");

	const installedNames = useMemo(
		() => new Set(skills.map((s) => s.name)),
		[skills],
	);
	const installed = useMemo(
		() => skills.filter((s) => matches(search, s.name, s.description)),
		[skills, search],
	);
	const recommended = useMemo(
		() =>
			SKILLS_CATALOG.filter(
				(e) =>
					!installedNames.has(e.key) && matches(search, e.name, e.description),
			),
		[installedNames, search],
	);

	const install = useMutation({
		mutationFn: (entry: SkillCatalogEntry) =>
			createSkill({
				name: entry.key,
				description: entry.description,
				content: skillCatalogContent(entry),
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: grexQueryKeys.librarySkills }),
	});

	if (editor) {
		return (
			<SkillEditor skillName={editor.name} onDone={() => setEditor(null)} />
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 px-8 py-3">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search skills…"
						className="pl-8"
					/>
				</div>
				<Button size="sm" onClick={() => setEditor({ name: null })}>
					<Plus className="size-4" />
					New skill
				</Button>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-5 px-6 pb-6">
					{installed.length > 0 ? (
						<Section title="Installed">
							{installed.map((skill) => (
								<InstalledCard
									key={skill.name}
									skill={skill}
									onClick={() => setEditor({ name: skill.name })}
								/>
							))}
						</Section>
					) : null}

					{recommended.length > 0 ? (
						<Section title="Recommended">
							{recommended.map((entry) => (
								<CatalogCard
									key={entry.key}
									entry={entry}
									pending={
										install.isPending && install.variables?.key === entry.key
									}
									onAdd={() => install.mutate(entry)}
								/>
							))}
						</Section>
					) : null}

					{installed.length === 0 && recommended.length === 0 ? (
						<p className="px-2 py-8 text-center text-small text-muted-foreground">
							No skills match “{search}”. Use New skill to create one.
						</p>
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<h3 className="px-2 text-small font-medium text-muted-foreground">
				{title}
			</h3>
			<div className="grid grid-cols-2 gap-2">{children}</div>
		</div>
	);
}

function InstalledCard({
	skill,
	onClick,
}: {
	skill: SkillSummary;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:border-border hover:bg-muted/40"
		>
			<BrandIcon iconKey={iconKeyForSkill(skill.name)} name={skill.name} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-1.5">
					<span className="truncate font-mono text-ui font-medium text-foreground">
						{skill.name}
					</span>
					{!skill.managed ? (
						<span className="shrink-0 text-nano text-muted-foreground">
							read-only
						</span>
					) : null}
				</div>
				<span className="line-clamp-2 text-small text-muted-foreground">
					{skill.description || "No description"}
				</span>
			</div>
		</button>
	);
}

function CatalogCard({
	entry,
	pending,
	onAdd,
}: {
	entry: SkillCatalogEntry;
	pending: boolean;
	onAdd: () => void;
}) {
	return (
		<div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3">
			<BrandIcon iconKey={entry.iconKey} name={entry.name} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-ui font-medium text-foreground">
					{entry.name}
				</span>
				<span className="line-clamp-2 text-small text-muted-foreground">
					{entry.description}
				</span>
			</div>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`Install ${entry.name}`}
				disabled={pending}
				onClick={onAdd}
			>
				<Plus className="size-4" />
			</Button>
		</div>
	);
}
