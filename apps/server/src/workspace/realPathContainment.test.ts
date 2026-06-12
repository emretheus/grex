import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveRealPathWithinRoot } from "./realPathContainment";

describe("resolveRealPathWithinRoot", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    // Realpath the tmp base up front so assertions compare canonical paths
    // (macOS /tmp -> /private/tmp would otherwise make startsWith checks flaky).
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codewit-realpath-")));
    root = path.join(base, "root");
    outside = path.join(base, "outside");
    await fs.mkdir(root);
    await fs.mkdir(outside);
  });

  afterEach(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it("resolves an existing in-root file to its canonical path", async () => {
    const target = path.join(root, "src", "index.ts");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "");
    expect(await resolveRealPathWithinRoot(root, target)).toBe(target);
  });

  it("allows a not-yet-existing file under an in-root directory", async () => {
    const target = path.join(root, "src", "new-file.ts");
    await fs.mkdir(path.dirname(target), { recursive: true });
    // The file does not exist yet, so containment is proven via the nearest
    // existing ancestor (the canonical `src` dir), which is non-null and in-root.
    const resolved = await resolveRealPathWithinRoot(root, target);
    expect(resolved).not.toBeNull();
    expect(resolved === root || resolved!.startsWith(root + path.sep)).toBe(true);
  });

  it("follows an in-root symlink that points within the root", async () => {
    const realDir = path.join(root, "real");
    await fs.mkdir(realDir);
    const realFile = path.join(realDir, "data.txt");
    await fs.writeFile(realFile, "");
    const link = path.join(root, "link.txt");
    await fs.symlink(realFile, link);
    expect(await resolveRealPathWithinRoot(root, link)).toBe(realFile);
  });

  it("rejects a symlink inside the root that escapes the root", async () => {
    const escaped = path.join(outside, "secret.txt");
    await fs.writeFile(escaped, "");
    const link = path.join(root, "escape.txt");
    await fs.symlink(escaped, link);
    expect(await resolveRealPathWithinRoot(root, link)).toBeNull();
  });

  it("rejects a path whose nearest existing ancestor escapes the root", async () => {
    // A symlinked directory inside the root that points outside; a new file
    // under it must be rejected even though the file does not exist yet.
    const linkedDir = path.join(root, "linkdir");
    await fs.symlink(outside, linkedDir);
    const target = path.join(linkedDir, "new.txt");
    expect(await resolveRealPathWithinRoot(root, target)).toBeNull();
  });

  it("rejects an absolute path entirely outside the root", async () => {
    const target = path.join(outside, "file.txt");
    await fs.writeFile(target, "");
    expect(await resolveRealPathWithinRoot(root, target)).toBeNull();
  });
});
