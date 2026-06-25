import { i18n } from "@/lib/i18n";
import type {
	ShortcutDefinition,
	ShortcutId,
	ShortcutMap,
	ShortcutScope,
} from "./types";

// `title` / `description` hold translation KEYS (under the `shortcuts`
// namespace), not display text. Resolve them with `getShortcutTitle` /
// `getShortcutDescription` at render so callers stay decoupled from i18n.
export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
	{
		id: "workspace.previous",
		title: "definitions.workspace.previous.title",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowUp",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.next",
		title: "definitions.workspace.next.title",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowDown",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.quickSwitchNext",
		title: "definitions.workspace.quickSwitchNext.title",
		group: "Navigation",
		defaultHotkey: "Control+Tab",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.quickSwitchPrevious",
		title: "definitions.workspace.quickSwitchPrevious.title",
		group: "Navigation",
		defaultHotkey: "Control+Shift+Tab",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "session.previous",
		title: "definitions.session.previous.title",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowLeft",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.next",
		title: "definitions.session.next.title",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowRight",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.new",
		title: "definitions.session.new.title",
		group: "Session",
		defaultHotkey: "Mod+T",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.close",
		title: "definitions.session.close.title",
		group: "Session",
		defaultHotkey: "Mod+W",
		scopes: ["chat"],
		editable: true,
	},
	{
		id: "session.reopenClosed",
		title: "definitions.session.reopenClosed.title",
		group: "Session",
		defaultHotkey: "Mod+Shift+R",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "window.close",
		title: "definitions.window.close.title",
		group: "System",
		defaultHotkey: "Mod+Shift+W",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.copyPath",
		title: "definitions.workspace.copyPath.title",
		group: "Workspace",
		// Unbound by default — Mod+Shift+C is reserved for the composer
		// context panel. Users can rebind from settings if they want.
		defaultHotkey: null,
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.openInEditor",
		title: "definitions.workspace.openInEditor.title",
		group: "Workspace",
		defaultHotkey: "Mod+O",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.new",
		title: "definitions.workspace.new.title",
		group: "Workspace",
		defaultHotkey: "Mod+N",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.justChat",
		title: "definitions.workspace.justChat.title",
		group: "Workspace",
		defaultHotkey: "Mod+Shift+N",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.addRepository",
		title: "definitions.workspace.addRepository.title",
		group: "Workspace",
		// Unbound by default — Mod+Shift+N now opens the start composer in
		// "Just chat" mode. Users can rebind from settings if they want.
		defaultHotkey: null,
		scopes: ["app"],
		editable: true,
	},
	{
		id: "workspace.filterSidebar",
		title: "definitions.workspace.filterSidebar.title",
		group: "Workspace",
		defaultHotkey: "Mod+Shift+F",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "script.run",
		title: "definitions.script.run.title",
		group: "Actions",
		defaultHotkey: "Mod+R",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "action.createPr",
		title: "definitions.action.createPr.title",
		group: "Actions",
		// Unbound by default — Mod+Shift+P is reserved for composer plan mode.
		// Users can rebind from settings if they want.
		defaultHotkey: null,
		scopes: ["app"],
		editable: true,
	},
	{
		id: "action.commitAndPush",
		title: "definitions.action.commitAndPush.title",
		group: "Actions",
		defaultHotkey: "Mod+Shift+Y",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "action.pullLatest",
		title: "definitions.action.pullLatest.title",
		group: "Actions",
		defaultHotkey: "Mod+Shift+L",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "action.mergePr",
		title: "definitions.action.mergePr.title",
		group: "Actions",
		defaultHotkey: "Mod+Shift+M",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "action.fixErrors",
		title: "definitions.action.fixErrors.title",
		group: "Actions",
		defaultHotkey: "Mod+Shift+X",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "action.openPullRequest",
		title: "definitions.action.openPullRequest.title",
		group: "Actions",
		defaultHotkey: "Mod+Shift+G",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "settings.open",
		title: "definitions.settings.open.title",
		group: "System",
		defaultHotkey: "Mod+,",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "library.open",
		title: "definitions.library.open.title",
		group: "System",
		defaultHotkey: "Mod+Shift+B",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "global.hotkey",
		title: "definitions.global.hotkey.title",
		description: "definitions.global.hotkey.description",
		group: "System",
		defaultHotkey: null,
		scopes: ["app"],
		editable: true,
	},
	{
		// OS-level hotkey registered by the Rust backend. The default below
		// MUST stay in sync with `default_hotkey` in src-tauri/src/global_hotkey.rs.
		id: "quickPanel.hotkey",
		title: "definitions.quickPanel.hotkey.title",
		description: "definitions.quickPanel.hotkey.description",
		group: "System",
		defaultHotkey: "Shift+Alt+Space",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "theme.toggle",
		title: "definitions.theme.toggle.title",
		group: "System",
		defaultHotkey: "Mod+Alt+T",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "window.miniMode.toggle",
		title: "definitions.window.miniMode.toggle.title",
		group: "System",
		defaultHotkey: "Mod+Control+M",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "sidebar.left.toggle",
		title: "definitions.sidebar.left.toggle.title",
		group: "System",
		defaultHotkey: "Mod+B",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "sidebar.right.toggle",
		title: "definitions.sidebar.right.toggle.title",
		group: "System",
		defaultHotkey: "Mod+Alt+B",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "zen.toggle",
		title: "definitions.zen.toggle.title",
		group: "System",
		defaultHotkey: "Mod+.",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "zoom.in",
		title: "definitions.zoom.in.title",
		group: "System",
		defaultHotkey: "Mod+=",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "zoom.out",
		title: "definitions.zoom.out.title",
		group: "System",
		defaultHotkey: "Mod+-",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "zoom.reset",
		title: "definitions.zoom.reset.title",
		group: "System",
		defaultHotkey: "Mod+0",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "composer.focus",
		title: "definitions.composer.focus.title",
		group: "Composer",
		defaultHotkey: "Mod+L",
		// App-scoped so the user can pop focus back to the composer from
		// anywhere — including the terminal — making composer ↔ terminal
		// (Mod+L vs Mod+Shift+J) a clean two-way switch.
		scopes: ["app"],
		editable: true,
	},
	{
		id: "composer.togglePlanMode",
		title: "definitions.composer.togglePlanMode.title",
		group: "Composer",
		defaultHotkey: "Mod+Shift+P",
		// workspace-composer only: plan mode is a per-session concept with
		// no UI on the start surface.
		scopes: ["workspace-composer"],
		editable: true,
	},
	{
		id: "composer.toggleTerminalMode",
		title: "definitions.composer.toggleTerminalMode.title",
		group: "Composer",
		defaultHotkey: "Mod+Shift+T",
		// App-scoped — handled in the global shortcut table, not composer-local.
		scopes: ["app"],
		editable: true,
	},
	{
		id: "startSurface.cycleRepository",
		title: "definitions.startSurface.cycleRepository.title",
		group: "Start surface",
		defaultHotkey: "Shift+Tab",
		// start-composer only: cycles through repositories in the start
		// composer.
		scopes: ["start-composer"],
		editable: true,
	},
	{
		id: "startSurface.openRepositoryPicker",
		title: "definitions.startSurface.openRepositoryPicker.title",
		group: "Start surface",
		defaultHotkey: "Alt+R",
		// start-composer only: opens the searchable repository picker.
		scopes: ["start-composer"],
		editable: true,
	},
	{
		id: "composer.toggleContextPanel",
		title: "definitions.composer.toggleContextPanel.title",
		group: "Composer",
		defaultHotkey: "Mod+Shift+C",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "composer.openModelPicker",
		title: "definitions.composer.openModelPicker.title",
		group: "Composer",
		defaultHotkey: "Alt+P",
		scopes: ["composer"],
		editable: true,
	},
	{
		id: "composer.toggleFollowUpBehavior",
		title: "definitions.composer.toggleFollowUpBehavior.title",
		group: "Composer",
		defaultHotkey: "Mod+Enter",
		scopes: ["composer"],
		editable: true,
	},
	{
		id: "editor.edit",
		title: "definitions.editor.edit.title",
		group: "Editor",
		defaultHotkey: "Mod+E",
		scopes: ["editor"],
		editable: true,
	},
	{
		id: "editor.new",
		title: "definitions.editor.new.title",
		group: "Editor",
		defaultHotkey: "Mod+T",
		scopes: ["editor"],
		editable: true,
	},
	{
		id: "editor.close",
		title: "definitions.editor.close.title",
		group: "Editor",
		defaultHotkey: "Mod+W",
		scopes: ["editor"],
		editable: true,
	},
	{
		id: "editor.toggleExplorer",
		title: "definitions.editor.toggleExplorer.title",
		group: "Editor",
		defaultHotkey: "Mod+Shift+E",
		scopes: ["editor"],
		editable: true,
	},
	{
		id: "terminal.new",
		title: "definitions.terminal.new.title",
		group: "Terminal",
		defaultHotkey: "Mod+T",
		scopes: ["terminal"],
		editable: true,
	},
	{
		id: "terminal.close",
		title: "definitions.terminal.close.title",
		group: "Terminal",
		defaultHotkey: "Mod+W",
		scopes: ["terminal"],
		editable: true,
	},
	{
		id: "terminal.previous",
		title: "definitions.terminal.previous.title",
		group: "Terminal",
		defaultHotkey: "Mod+Alt+ArrowLeft",
		scopes: ["terminal"],
		editable: true,
	},
	{
		id: "terminal.next",
		title: "definitions.terminal.next.title",
		group: "Terminal",
		defaultHotkey: "Mod+Alt+ArrowRight",
		scopes: ["terminal"],
		editable: true,
	},
	{
		id: "inspector.focusTerminal",
		title: "definitions.inspector.focusTerminal.title",
		group: "Terminal",
		defaultHotkey: "Mod+Shift+J",
		scopes: ["app"],
		editable: true,
	},
	{
		id: "inspector.toggleScripts",
		title: "definitions.inspector.toggleScripts.title",
		group: "Workspace",
		defaultHotkey: "Mod+J",
		scopes: ["app"],
		editable: true,
	},
];

export const SHORTCUT_DEFINITION_BY_ID = new Map(
	SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

// Resolve a definition's localized display title. `definition.title` holds a
// translation key under the `shortcuts` namespace; this returns the current
// language's string via the shared i18n instance.
export function getShortcutTitle(definition: ShortcutDefinition): string {
	return i18n.t(definition.title, { ns: "shortcuts" });
}

// Resolve a definition's localized description, or `undefined` when the
// definition has none.
export function getShortcutDescription(
	definition: ShortcutDefinition,
): string | undefined {
	return definition.description
		? i18n.t(definition.description, { ns: "shortcuts" })
		: undefined;
}

export function getShortcut(
	overrides: ShortcutMap,
	id: ShortcutId,
): string | null {
	if (Object.hasOwn(overrides, id)) {
		return overrides[id] ?? null;
	}
	return SHORTCUT_DEFINITION_BY_ID.get(id)?.defaultHotkey ?? null;
}

export function updateShortcutOverride(
	overrides: ShortcutMap,
	id: ShortcutId,
	hotkey: string | null,
): ShortcutMap {
	const next = { ...overrides };
	const fallback = SHORTCUT_DEFINITION_BY_ID.get(id)?.defaultHotkey ?? null;
	if (hotkey === fallback) {
		delete next[id];
	} else {
		next[id] = hotkey;
	}
	return next;
}

// Two scope sets "overlap" if at least one shortcut would fire under the same
// active scope. "app" is the wildcard — anything paired with "app" overlaps.
export function scopesOverlap(
	a: readonly ShortcutScope[],
	b: readonly ShortcutScope[],
): boolean {
	if (a.includes("app") || b.includes("app")) return true;
	return a.some((scope) => b.includes(scope));
}

// Scope-aware conflict for the settings UI: a shortcut conflicts with another
// only if they share both a hotkey AND a scope (so chat's Mod+T and terminal's
// Mod+T are deliberately fine).
export function findShortcutConflict(
	overrides: ShortcutMap,
	id: ShortcutId,
	hotkey: string | null,
): ShortcutDefinition | null {
	if (!hotkey) return null;
	const subject = SHORTCUT_DEFINITION_BY_ID.get(id);
	if (!subject) return null;
	return (
		SHORTCUT_DEFINITIONS.find(
			(definition) =>
				definition.id !== id &&
				getShortcut(overrides, definition.id) === hotkey &&
				scopesOverlap(subject.scopes, definition.scopes),
		) ?? null
	);
}

export function getShortcutConflicts(overrides: ShortcutMap): {
	conflictById: Partial<Record<ShortcutId, ShortcutDefinition[]>>;
	disabledIds: Set<ShortcutId>;
} {
	const definitionsByHotkey = new Map<string, ShortcutDefinition[]>();
	for (const definition of SHORTCUT_DEFINITIONS) {
		const hotkey = getShortcut(overrides, definition.id);
		if (!hotkey) continue;
		const definitions = definitionsByHotkey.get(hotkey) ?? [];
		definitions.push(definition);
		definitionsByHotkey.set(hotkey, definitions);
	}

	const conflictById: Partial<Record<ShortcutId, ShortcutDefinition[]>> = {};
	const disabledIds = new Set<ShortcutId>();
	for (const definitions of definitionsByHotkey.values()) {
		if (definitions.length < 2) continue;
		for (let i = 0; i < definitions.length; i++) {
			for (let j = i + 1; j < definitions.length; j++) {
				const a = definitions[i];
				const b = definitions[j];
				if (!scopesOverlap(a.scopes, b.scopes)) continue;
				conflictById[a.id] = [...(conflictById[a.id] ?? []), b];
				conflictById[b.id] = [...(conflictById[b.id] ?? []), a];
				disabledIds.add(a.id);
				disabledIds.add(b.id);
			}
		}
	}
	return { conflictById, disabledIds };
}
