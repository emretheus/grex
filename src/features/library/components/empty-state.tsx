import type { LucideIcon } from "lucide-react";

/** Shared centered empty/placeholder state for Library panels. */
export function LibraryEmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
			<div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
				<Icon className="size-6" strokeWidth={1.6} />
			</div>
			<div className="space-y-1">
				<p className="text-ui font-medium text-foreground">{title}</p>
				<p className="mx-auto max-w-sm text-small text-muted-foreground">
					{description}
				</p>
			</div>
		</div>
	);
}
