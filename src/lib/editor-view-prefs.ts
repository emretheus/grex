// Editor view preferences (word wrap / minimap / sticky scroll / whitespace).
//
// Kept in its OWN module — separate from `monaco-runtime` — so the editor
// header menu can read/write these without statically importing Monaco (which
// would eagerly pull the ~MBs editor bundle into the main chunk). `monaco-
// runtime` subscribes here and applies the options to every live editor.

export type EditorViewPrefs = {
	wordWrap: boolean;
	minimap: boolean;
	stickyScroll: boolean;
	whitespace: boolean;
};

const STORAGE_KEY = "grex.editor.viewPrefs";

const DEFAULT_PREFS: EditorViewPrefs = {
	wordWrap: true,
	minimap: false,
	stickyScroll: true,
	whitespace: false,
};

let prefs: EditorViewPrefs = load();
const subscribers = new Set<(prefs: EditorViewPrefs) => void>();

function load(): EditorViewPrefs {
	try {
		const raw =
			typeof localStorage !== "undefined"
				? localStorage.getItem(STORAGE_KEY)
				: null;
		if (!raw) return { ...DEFAULT_PREFS };
		const parsed = JSON.parse(raw);
		return {
			...DEFAULT_PREFS,
			...(parsed && typeof parsed === "object" ? parsed : {}),
		};
	} catch {
		return { ...DEFAULT_PREFS };
	}
}

export function getEditorViewPrefs(): EditorViewPrefs {
	return { ...prefs };
}

export function setEditorViewPrefs(
	patch: Partial<EditorViewPrefs>,
): EditorViewPrefs {
	prefs = { ...prefs, ...patch };
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// Best-effort persistence.
	}
	for (const fn of subscribers) fn({ ...prefs });
	return { ...prefs };
}

/** Subscribe to pref changes. Returns an unsubscribe fn. */
export function subscribeEditorViewPrefs(
	fn: (prefs: EditorViewPrefs) => void,
): () => void {
	subscribers.add(fn);
	return () => {
		subscribers.delete(fn);
	};
}
