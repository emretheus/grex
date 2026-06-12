import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import type { DiffFileStatus, EditorSessionState } from "@/lib/editor-session";
import { convertFileSrc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<DiffFileStatus, string> = {
	A: "Added",
	M: "Modified",
	D: "Deleted",
};

const STATUS_CLASS: Record<DiffFileStatus, string> = {
	A: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
	M: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
	D: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

// Checkerboard so transparent PNG/SVG regions are visible rather than blending
// into the surface. Pure CSS — two diagonal gradients tiled at 16px.
const CHECKERBOARD_STYLE: React.CSSProperties = {
	backgroundColor: "var(--color-editor-chrome, #1e1e1e)",
	backgroundImage:
		"linear-gradient(45deg, rgba(128,128,128,0.18) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.18) 75%), " +
		"linear-gradient(45deg, rgba(128,128,128,0.18) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.18) 75%)",
	backgroundSize: "16px 16px",
	backgroundPosition: "0 0, 8px 8px",
};

function formatDimensions(
	dims: { w: number; h: number } | null,
): string | null {
	if (!dims) return null;
	return `${dims.w} × ${dims.h}px`;
}

/**
 * Renders an image file (png/jpg/gif/webp/svg/…) from the working tree via the
 * Tauri asset protocol instead of routing its bytes through Monaco (which shows
 * raw/garbled text for binary). Used by the editor surface when an image is
 * opened from the Changes panel.
 *
 * Scope note: this previews the on-disk (current) version of the file plus its
 * change status. A true before/after image diff needs the base-ref bytes, which
 * the text-only `readFileAtRef` IPC can't return — that's a follow-up that would
 * add a bytes-at-ref backend command. Deleted images have no on-disk bytes, so
 * we show a "deleted" notice rather than a broken image.
 */
export function EditorImagePreview({
	session,
}: {
	session: EditorSessionState;
}) {
	const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
	const [errored, setErrored] = useState(false);

	// Reset transient view state whenever the previewed file changes so a fresh
	// open doesn't briefly show the previous image's dimensions / error.
	useEffect(() => {
		setDims(null);
		setErrored(false);
	}, [session.path]);

	const status = session.fileStatus;
	const statusLabel = status ? STATUS_LABEL[status] : null;
	const deleted = status === "D";
	const src = convertFileSrc(session.path);
	const dimsLabel = formatDimensions(dims);

	return (
		<div
			aria-label="Image preview"
			className="absolute inset-0 flex flex-col bg-background"
		>
			<div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/50 px-4 text-micro text-muted-foreground">
				{statusLabel ? (
					<span
						className={cn(
							"inline-flex h-4 items-center rounded-[3px] px-1.5 font-medium",
							status ? STATUS_CLASS[status] : undefined,
						)}
					>
						{statusLabel}
					</span>
				) : null}
				{dimsLabel ? <span className="tabular-nums">{dimsLabel}</span> : null}
			</div>

			<div
				className="grid min-h-0 flex-1 place-items-center overflow-auto p-6"
				style={CHECKERBOARD_STYLE}
			>
				{deleted ? (
					<ImageNotice icon message="This image was deleted in this change." />
				) : errored ? (
					<ImageNotice icon message="Couldn't load this image from disk." />
				) : (
					<img
						src={src}
						alt={`Preview of ${session.path}`}
						className="max-h-full max-w-full object-contain shadow-sm"
						onLoad={(event) => {
							const img = event.currentTarget;
							if (img.naturalWidth && img.naturalHeight) {
								setDims({ w: img.naturalWidth, h: img.naturalHeight });
							}
						}}
						onError={() => setErrored(true)}
					/>
				)}
			</div>
		</div>
	);
}

function ImageNotice({ message, icon }: { message: string; icon?: boolean }) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-md bg-background/80 px-4 py-3 text-center text-ui text-muted-foreground">
			{icon ? <ImageOff className="size-5" strokeWidth={1.7} /> : null}
			<span>{message}</span>
		</div>
	);
}
