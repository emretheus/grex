---
"grex": patch
---

Fix agent questions getting permanently stuck on "Awaiting answer" with no way to respond.

- Rebuild the interactive answer panel from the persisted thread after a window reload or re-attach, so a parked question stays answerable instead of leaving only a read-only "Awaiting answer" card.
- Surface an error and re-show the question when an answer can't reach the agent (e.g. the app was restarted and the turn is gone), instead of silently dropping it.
