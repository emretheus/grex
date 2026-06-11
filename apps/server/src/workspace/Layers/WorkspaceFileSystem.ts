import { Effect, FileSystem, Layer, Path } from "effect";

import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem";
import { WorkspaceEntries } from "../Services/WorkspaceEntries";
import { WorkspacePathOutsideRootError, WorkspacePaths } from "../Services/WorkspacePaths";
import { resolveRealPathWithinRoot } from "../realPathContainment";

// Editor load ceiling: files larger than this are reported as truncated so the
// renderer can show a "file too large" affordance instead of streaming MBs over
// the WebSocket and blowing up Monaco.
const MAX_READ_FILE_BYTES = 2 * 1024 * 1024;

export const makeWorkspaceFileSystem = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries;

  // Canonicalize through the filesystem after the string-level guard so an
  // in-root symlink that escapes the workspace cannot smuggle a read/write out.
  // Rejects with the same out-of-root error the string guard uses.
  const assertRealPathWithinRoot = (input: {
    cwd: string;
    relativePath: string;
    absolutePath: string;
  }) =>
    Effect.tryPromise({
      try: () => resolveRealPathWithinRoot(input.cwd, input.absolutePath),
      catch: (cause) =>
        new WorkspaceFileSystemError({
          cwd: input.cwd,
          relativePath: input.relativePath,
          operation: "workspaceFileSystem.realpath",
          detail: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    }).pipe(
      Effect.flatMap((realPath) =>
        realPath === null
          ? Effect.fail(
              new WorkspacePathOutsideRootError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
              }),
            )
          : Effect.succeed(realPath),
      ),
    );

  const writeFile: WorkspaceFileSystemShape["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.makeDirectory",
            detail: cause.message,
            cause,
          }),
      ),
    );
    // After the parent dir exists, canonicalize to reject a symlinked path that
    // escapes the workspace before any bytes land on disk.
    yield* assertRealPathWithinRoot({
      cwd: input.cwd,
      relativePath: input.relativePath,
      absolutePath: target.absolutePath,
    });
    yield* fileSystem.writeFileString(target.absolutePath, input.contents).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.writeFile",
            detail: cause.message,
            cause,
          }),
      ),
    );
    yield* workspaceEntries.invalidate(input.cwd);
    return { relativePath: target.relativePath };
  });

  const readFile: WorkspaceFileSystemShape["readFile"] = Effect.fn("WorkspaceFileSystem.readFile")(
    function* (input) {
      const target = yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
      });

      yield* assertRealPathWithinRoot({
        cwd: input.cwd,
        relativePath: input.relativePath,
        absolutePath: target.absolutePath,
      });

      const info = yield* fileSystem.stat(target.absolutePath).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceFileSystemError({
              cwd: input.cwd,
              relativePath: input.relativePath,
              operation: "workspaceFileSystem.stat",
              detail: cause.message,
              cause,
            }),
        ),
      );

      const totalSize = Number(info.size);

      // Guard the socket: never stream files larger than the editor load limit.
      if (totalSize > MAX_READ_FILE_BYTES) {
        return { relativePath: target.relativePath, contents: "", truncated: true, totalSize };
      }

      const contents = yield* fileSystem.readFileString(target.absolutePath).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceFileSystemError({
              cwd: input.cwd,
              relativePath: input.relativePath,
              operation: "workspaceFileSystem.readFile",
              detail: cause.message,
              cause,
            }),
        ),
      );

      return { relativePath: target.relativePath, contents, truncated: false, totalSize };
    },
  );

  return { writeFile, readFile } satisfies WorkspaceFileSystemShape;
});

export const WorkspaceFileSystemLive = Layer.effect(WorkspaceFileSystem, makeWorkspaceFileSystem);
