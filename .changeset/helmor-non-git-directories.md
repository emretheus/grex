---
"grex": patch
---

Open project can now attach a session to any local folder that isn't a git repository. Non-git folders work out of the box and use the chat-style layout — no diff/inspector panel or branch pickers — and their repository settings page shows a "Non-git repository" notice instead of remote, branch, and account options. Also hardens agent process PATH resolution so bundled CLIs reliably find their executables (Windows PATH is rebuilt from the registry, and Windows absolute/UNC git-pointer paths resolve correctly).
