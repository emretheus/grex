import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "vitest";

import {
  resolveActiveCodexHomeWritePath,
  resolveBaseCodexHomePath,
  resolveCodexHomeAllowlistCandidates,
  resolveCodewitCodexHomeOverlayPath,
  shouldDisableCodexBrowserPlugin,
} from "./codexHomePaths.ts";

describe("resolveBaseCodexHomePath", () => {
  it("prefers the explicit home path over CODEX_HOME and the default", () => {
    assert.equal(
      resolveBaseCodexHomePath({ CODEX_HOME: "/env/codex" }, "/explicit/codex"),
      "/explicit/codex",
    );
  });

  it("falls back to CODEX_HOME when no explicit home is supplied", () => {
    assert.equal(resolveBaseCodexHomePath({ CODEX_HOME: "/env/codex" }), "/env/codex");
  });

  it("falls back to ~/.codex when nothing is provided", () => {
    const result = resolveBaseCodexHomePath({});
    assert.ok(result.endsWith(`${path.sep}.codex`));
  });
});

describe("resolveCodewitCodexHomeOverlayPath", () => {
  it("anchors the overlay under CODEWIT_HOME when set", () => {
    assert.equal(
      resolveCodewitCodexHomeOverlayPath({ CODEWIT_HOME: "/codewit/runtime" }, "/users/me/.codex"),
      path.join("/codewit/runtime", "codex-home-overlay"),
    );
  });

  it("derives a default overlay sibling of the source home", () => {
    assert.equal(
      resolveCodewitCodexHomeOverlayPath({}, "/users/me/.codex"),
      path.join("/users/me", ".codewit", "runtime", "codex-home-overlay"),
    );
  });
});

describe("shouldDisableCodexBrowserPlugin", () => {
  it("disables the plugin (overlay active) by default", () => {
    assert.equal(shouldDisableCodexBrowserPlugin({}), true);
  });

  it("respects the explicit '0' opt-out", () => {
    assert.equal(
      shouldDisableCodexBrowserPlugin({ CODEWIT_DISABLE_CODEX_BROWSER_PLUGIN: "0" }),
      false,
    );
  });
});

describe("resolveActiveCodexHomeWritePath", () => {
  it("returns the overlay home when the plugin is disabled (default)", () => {
    assert.equal(
      resolveActiveCodexHomeWritePath({
        env: { CODEWIT_HOME: "/codewit/runtime" },
        homePath: "/users/me/.codex",
      }),
      path.join("/codewit/runtime", "codex-home-overlay"),
    );
  });

  it("returns the source home when the plugin is explicitly enabled", () => {
    assert.equal(
      resolveActiveCodexHomeWritePath({
        env: {
          CODEWIT_HOME: "/dp/runtime",
          CODEWIT_DISABLE_CODEX_BROWSER_PLUGIN: "0",
        },
        homePath: "/users/me/.codex",
      }),
      "/users/me/.codex",
    );
  });
});

describe("resolveCodexHomeAllowlistCandidates", () => {
  it("includes both source and overlay homes when distinct", () => {
    const candidates = resolveCodexHomeAllowlistCandidates({
      env: { CODEWIT_HOME: "/codewit/runtime" },
      homePath: "/users/me/.codex",
    });
    assert.deepEqual(candidates, [
      "/users/me/.codex",
      path.join("/codewit/runtime", "codex-home-overlay"),
    ]);
  });

  it("returns just the source when overlay equals source", () => {
    const candidates = resolveCodexHomeAllowlistCandidates({
      env: { CODEWIT_HOME: "/users/me" },
      homePath: path.join("/users/me", "codex-home-overlay"),
    });
    assert.deepEqual(candidates, [path.join("/users/me", "codex-home-overlay")]);
  });
});
