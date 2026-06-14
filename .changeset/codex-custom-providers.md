---
"grex": minor
---

Custom AI provider improvements:
- Codex now supports custom providers — point it at any OpenAI-compatible (Responses API) endpoint in Settings, fetch its models, and pick which ones show up in the composer. The provider definition is injected per-thread (never writes `~/.codex/config.toml`).
- Pick which official Claude and Codex models appear in the composer's model picker; deselecting all of a provider hides its section.
