import { describe, expect, it } from "vitest";

import {
  buildGitFileStatusMap,
  gitFileStatusBadge,
  gitFileStatusColorClass,
} from "./gitFileStatus";

const ADDED = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
`;

const MODIFIED = `diff --git a/src/existing.ts b/src/existing.ts
index 1111111..2222222 100644
--- a/src/existing.ts
+++ b/src/existing.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;
`;

const DELETED = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 3333333..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-const gone = true;
`;

// A rename that also changes content (the common working-tree case — git emits
// hunks, so the patch parser produces a file entry). A pure 100%-similarity
// rename has no hunks and is intentionally left untinted.
const RENAMED = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 80%
rename from src/old-name.ts
rename to src/new-name.ts
index 1111111..2222222 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;
`;

describe("buildGitFileStatusMap", () => {
  it("classifies added, modified, and deleted files", () => {
    const map = buildGitFileStatusMap([ADDED, MODIFIED, DELETED].join("\n"));
    expect(map.get("src/new-file.ts")).toBe("added");
    expect(map.get("src/existing.ts")).toBe("modified");
    expect(map.get("src/gone.ts")).toBe("deleted");
  });

  it("records both paths for a rename", () => {
    const map = buildGitFileStatusMap(RENAMED);
    expect(map.get("src/new-name.ts")).toBe("renamed");
    expect(map.get("src/old-name.ts")).toBe("renamed");
  });

  it("returns an empty map for an empty or undefined patch", () => {
    expect(buildGitFileStatusMap(undefined).size).toBe(0);
    expect(buildGitFileStatusMap("").size).toBe(0);
    expect(buildGitFileStatusMap("   ").size).toBe(0);
  });
});

describe("status presentation helpers", () => {
  it("maps each status to a color and a badge", () => {
    expect(gitFileStatusBadge("added")).toBe("A");
    expect(gitFileStatusBadge("modified")).toBe("M");
    expect(gitFileStatusBadge("deleted")).toBe("D");
    expect(gitFileStatusBadge("renamed")).toBe("R");
    expect(gitFileStatusBadge(undefined)).toBeNull();

    expect(gitFileStatusColorClass("added")).toContain("emerald");
    expect(gitFileStatusColorClass("deleted")).toContain("rose");
    expect(gitFileStatusColorClass("modified")).toContain("amber");
    expect(gitFileStatusColorClass("renamed")).toContain("sky");
    expect(gitFileStatusColorClass(undefined)).toBeNull();
  });
});
