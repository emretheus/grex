// Patch serialization utilities for hunk-level git staging.
//
// Reconstructs valid unified-diff patch strings from @pierre/diffs' FileDiffMetadata
// so they can be passed to `git apply [--cached] [--reverse]`.
//
// Key data model facts confirmed from @pierre/diffs types:
// - hunkContent segment indices (additionLineIndex, deletionLineIndex) are absolute
//   indices into the file-level additionLines/deletionLines arrays, NOT hunk-relative.
// - Context lines are identical on both sides; we read from additionLines.
// - For a ChangeContent: deletions come first, then additions (unified diff order).

import type { FileDiffMetadata, Hunk } from "@pierre/diffs";

function hunkHeader(hunk: Hunk): string {
  const ctx = hunk.hunkContext ? ` ${hunk.hunkContext}` : "";
  return `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@${ctx}`;
}

function fileHeader(file: FileDiffMetadata): string {
  const oldPath = file.prevName ?? file.name;
  const newPath = file.name;
  return [`diff --git a/${oldPath} b/${newPath}`, `--- a/${oldPath}`, `+++ b/${newPath}`].join(
    "\n",
  );
}

function emitHunkLines(file: FileDiffMetadata, hunk: Hunk): string[] {
  const lines: string[] = [];
  // Track whether the last emitted physical line was a deletion or addition
  // so we know which noEOFCR flag to check after each segment.
  let lastWasDeletion = false;

  for (const seg of hunk.hunkContent) {
    if (seg.type === "context") {
      for (let k = 0; k < seg.lines; k++) {
        lines.push(` ${file.additionLines[seg.additionLineIndex + k] ?? ""}`);
      }
      lastWasDeletion = false;
    } else {
      // deletions first
      for (let k = 0; k < seg.deletions; k++) {
        lines.push(`-${file.deletionLines[seg.deletionLineIndex + k] ?? ""}`);
      }
      if (seg.deletions > 0) lastWasDeletion = true;
      // then additions
      for (let k = 0; k < seg.additions; k++) {
        lines.push(`+${file.additionLines[seg.additionLineIndex + k] ?? ""}`);
      }
      if (seg.additions > 0) lastWasDeletion = false;
    }
  }

  // Append no-newline markers after the relevant final lines.
  // The marker attaches immediately after the last line of its side.
  // For a trailing context block both flags are the same value; emit once.
  const lastSeg = hunk.hunkContent[hunk.hunkContent.length - 1];
  if (lastSeg) {
    if (lastSeg.type === "context") {
      if (hunk.noEOFCRDeletions) lines.push("\\ No newline at end of file");
    } else {
      // mixed change: may need markers for both sides
      if (hunk.noEOFCRDeletions && lastSeg.deletions > 0 && lastSeg.additions === 0) {
        lines.push("\\ No newline at end of file");
      }
      if (hunk.noEOFCRAdditions && lastSeg.additions > 0) {
        lines.push("\\ No newline at end of file");
      }
    }
  }

  void lastWasDeletion; // used for tracking, suppress unused warning
  return lines;
}

/**
 * Build a complete unified-diff patch string for a single hunk of a file.
 * The result can be piped to `git apply [--cached] [--reverse] -`.
 */
export function buildHunkPatch(file: FileDiffMetadata, hunkIndex: number): string {
  const hunk = file.hunks[hunkIndex];
  if (!hunk) throw new Error(`Hunk index ${hunkIndex} out of range for file ${file.name}`);

  const header = fileHeader(file);
  const hunkHdr = hunkHeader(hunk);
  const body = emitHunkLines(file, hunk);

  return [header, hunkHdr, ...body, ""].join("\n");
}

/**
 * Build a patch for a subset of lines within a hunk (line-level staging, v2).
 * `selectedDeletionIndices` = which deletion lines (0-based within hunk) to include.
 * `selectedAdditionIndices` = which addition lines (0-based within hunk) to include.
 *
 * Unselected deletions become context lines (they remain in the working tree / index).
 * Unselected additions are dropped from the patch entirely.
 * The @@ header line counts are recomputed to reflect the resulting line counts.
 *
 * TODO(line-staging-v2): wire this into HunkActionsPanel with per-line selection state.
 */
export function buildLinesPatch(
  file: FileDiffMetadata,
  hunkIndex: number,
  selectedDeletionIndices: ReadonlySet<number>,
  selectedAdditionIndices: ReadonlySet<number>,
): string {
  const hunk = file.hunks[hunkIndex];
  if (!hunk) throw new Error(`Hunk index ${hunkIndex} out of range for file ${file.name}`);

  const lines: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let hunkDeletionOffset = 0; // tracks absolute deletion index within hunk
  let hunkAdditionOffset = 0; // tracks absolute addition index within hunk

  for (const seg of hunk.hunkContent) {
    if (seg.type === "context") {
      for (let k = 0; k < seg.lines; k++) {
        lines.push(` ${file.additionLines[seg.additionLineIndex + k] ?? ""}`);
        oldCount++;
        newCount++;
      }
    } else {
      // deletions: selected → keep as deletion; unselected → convert to context
      for (let k = 0; k < seg.deletions; k++) {
        const absIdx = hunkDeletionOffset + k;
        const text = file.deletionLines[seg.deletionLineIndex + k] ?? "";
        if (selectedDeletionIndices.has(absIdx)) {
          lines.push(`-${text}`);
          oldCount++;
        } else {
          // unselected deletion stays as context in the new patch
          lines.push(` ${text}`);
          oldCount++;
          newCount++;
        }
      }
      hunkDeletionOffset += seg.deletions;

      // additions: selected → keep; unselected → drop
      for (let k = 0; k < seg.additions; k++) {
        const absIdx = hunkAdditionOffset + k;
        const text = file.additionLines[seg.additionLineIndex + k] ?? "";
        if (selectedAdditionIndices.has(absIdx)) {
          lines.push(`+${text}`);
          newCount++;
        }
        // else: drop entirely
      }
      hunkAdditionOffset += seg.additions;
    }
  }

  const ctx = hunk.hunkContext ? ` ${hunk.hunkContext}` : "";
  const hunkHdr = `@@ -${hunk.deletionStart},${oldCount} +${hunk.additionStart},${newCount} @@${ctx}`;

  const header = fileHeader(file);
  return [header, hunkHdr, ...lines, ""].join("\n");
}
