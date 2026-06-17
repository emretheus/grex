import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PromptTemplate } from "@/lib/api";
import { libraryPromptsQueryOptions } from "@/lib/query-client";
import { LibraryEmptyState } from "../components/empty-state";
import { PromptEditor } from "./prompt-editor";

type EditorTarget = { mode: "new" } | { mode: "edit"; prompt: PromptTemplate };

/** Library → Prompts: list, search, create, edit, and delete reusable prompts. */
export function LibraryPromptsPanel() {
	const { t } = useTranslation("library");
	const { data: prompts = [] } = useQuery(libraryPromptsQueryOptions());
	const [search, setSearch] = useState("");
	const [editor, setEditor] = useState<EditorTarget | null>(null);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return prompts;
		return prompts.filter(
			(p) =>
				p.title.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q),
		);
	}, [prompts, search]);

	if (editor) {
		return (
			<PromptEditor
				prompt={editor.mode === "edit" ? editor.prompt : null}
				onDone={() => setEditor(null)}
			/>
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
						placeholder={t("prompts.searchPlaceholder")}
						className="pl-8"
					/>
				</div>
				<Button size="sm" onClick={() => setEditor({ mode: "new" })}>
					<Plus className="size-4" />
					{t("prompts.new")}
				</Button>
			</div>

			{prompts.length === 0 ? (
				<LibraryEmptyState
					icon={FileText}
					title={t("prompts.emptyTitle")}
					description={t("prompts.emptyDescription")}
				/>
			) : filtered.length === 0 ? (
				<LibraryEmptyState
					icon={Search}
					title={t("prompts.noMatchesTitle")}
					description={t("prompts.noMatchesDescription")}
				/>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<ul className="flex flex-col gap-1 px-5 pb-6">
						{filtered.map((prompt) => (
							<li key={prompt.id}>
								<button
									type="button"
									onClick={() => setEditor({ mode: "edit", prompt })}
									className="flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
								>
									<span className="truncate text-ui font-medium text-foreground">
										{prompt.title}
									</span>
									<span className="line-clamp-2 text-small text-muted-foreground">
										{prompt.prompt}
									</span>
								</button>
							</li>
						))}
					</ul>
				</ScrollArea>
			)}
		</div>
	);
}
