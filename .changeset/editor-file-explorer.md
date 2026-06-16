---
"grex": minor
---

Add a file-explorer sidebar to the editor for browsing the whole codebase.

- Toggle a left-hand file tree from the editor header to browse the workspace's folder structure and click any file open in the Monaco editor.
- The tree loads one folder level at a time (lazily, cached per folder) and hides noise like `.git`, `node_modules`, and build output, so it stays fast on large repos.
