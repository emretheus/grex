// FILE: desktopWsBridge.test.ts
// Purpose: Verifies desktop WebSocket URL resolution reads the Codewit env name.

import { describe, expect, it } from "vitest";

import { normalizeDesktopWsUrl, resolveDesktopWsUrlFromEnv } from "./desktopWsBridge";

describe("desktopWsBridge", () => {
  it("normalizes non-empty WebSocket URL strings", () => {
    expect(normalizeDesktopWsUrl(" ws://127.0.0.1:1234/?token=test ")).toBe(
      "ws://127.0.0.1:1234/?token=test",
    );
  });

  it("rejects empty or non-string values", () => {
    expect(normalizeDesktopWsUrl("   ")).toBeNull();
    expect(normalizeDesktopWsUrl(null)).toBeNull();
  });

  it("resolves CODEWIT_DESKTOP_WS_URL from the environment", () => {
    expect(
      resolveDesktopWsUrlFromEnv({
        CODEWIT_DESKTOP_WS_URL: "ws://127.0.0.1:6000/?token=codewit",
      } as NodeJS.ProcessEnv),
    ).toBe("ws://127.0.0.1:6000/?token=codewit");
  });

  it("returns null when CODEWIT_DESKTOP_WS_URL is absent", () => {
    expect(resolveDesktopWsUrlFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
