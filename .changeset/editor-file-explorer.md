---
"grex": minor
---

Add a file-explorer sidebar to the editor for browsing the whole codebase.

- Toggle a left-hand file tree from the editor header to browse the workspace's folder structure and click any file open in the Monaco editor.
- A "Browse files" button in the Changes panel opens the explorer directly — so you can browse and open files even on a branch with no changes yet, without needing a file to click first.
- The tree loads one folder level at a time (lazily, cached per folder) and hides noise like `.git`, `node_modules`, and build output, so it stays fast on large repos.
- IDE-grade touches: per-extension file icons, git-status badges (M/A/D) on changed files with a dot on folders that contain changes, and the tree auto-reveals + scrolls to the file you open.
- Right-click any file or folder to copy its path, reveal it in Finder, open it in an external editor, or add a file to the chat composer as agent context.
- The sidebar is drag-resizable and toggles with `Cmd/Ctrl+Shift+E`; its width, open state, and expanded folders persist across sessions.
