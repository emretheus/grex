import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, expect, vi } from "vitest";

vi.mock("../../processRunner", () => ({
  runProcess: vi.fn(),
}));

import { runProcess } from "../../processRunner";
import { GitHubCli } from "../Services/GitHubCli.ts";
import { GitHubCliLive } from "./GitHubCli.ts";

const mockedRunProcess = vi.mocked(runProcess);
const layer = it.layer(GitHubCliLive);

afterEach(() => {
  mockedRunProcess.mockReset();
});

layer("GitHubCliLive", (it) => {
  it.effect("parses pull request view output", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 42,
          title: "Add PR thread creation",
          url: "https://github.com/pingdotgg/codewit/pull/42",
          baseRefName: "main",
          headRefName: "feature/pr-threads",
          state: "OPEN",
          mergedAt: null,
          isCrossRepository: true,
          headRepository: {
            nameWithOwner: "octocat/codewit",
          },
          headRepositoryOwner: {
            login: "octocat",
          },
        }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });

      const result = yield* Effect.gen(function* () {
        const gh = yield* GitHubCli;
        return yield* gh.getPullRequest({
          cwd: "/repo",
          reference: "#42",
        });
      });

      assert.deepStrictEqual(result, {
        number: 42,
        title: "Add PR thread creation",
        url: "https://github.com/pingdotgg/codewit/pull/42",
        baseRefName: "main",
        headRefName: "feature/pr-threads",
        state: "open",
        isCrossRepository: true,
        headRepositoryNameWithOwner: "octocat/codewit",
        headRepositoryOwnerLogin: "octocat",
      });
      expect(mockedRunProcess).toHaveBeenCalledWith(
        "gh",
        [
          "pr",
          "view",
          "#42",
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
        expect.objectContaining({ cwd: "/repo" }),
      );
    }),
  );

  it.effect("reads repository clone URLs", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({
          nameWithOwner: "octocat/codewit",
          url: "https://github.com/octocat/codewit",
          sshUrl: "git@github.com:octocat/codewit.git",
        }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });

      const result = yield* Effect.gen(function* () {
        const gh = yield* GitHubCli;
        return yield* gh.getRepositoryCloneUrls({
          cwd: "/repo",
          repository: "octocat/codewit",
        });
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codewit",
        url: "https://github.com/octocat/codewit",
        sshUrl: "git@github.com:octocat/codewit.git",
      });
    }),
  );

  it.effect("surfaces a friendly error when the pull request is not found", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockRejectedValueOnce(
        new Error(
          "GraphQL: Could not resolve to a PullRequest with the number of 4888. (repository.pullRequest)",
        ),
      );

      const error = yield* Effect.gen(function* () {
        const gh = yield* GitHubCli;
        return yield* gh.getPullRequest({
          cwd: "/repo",
          reference: "4888",
        });
      }).pipe(Effect.flip);

      assert.equal(error.message.includes("Pull request not found"), true);
    }),
  );

  it.effect("passes --draft to gh pr create only when requested", () =>
    Effect.gen(function* () {
      const okResult = { stdout: "", stderr: "", code: 0, signal: null, timedOut: false };
      mockedRunProcess.mockResolvedValue(okResult);
      const gh = yield* GitHubCli;

      yield* gh.createPullRequest({
        cwd: "/repo",
        baseBranch: "main",
        headSelector: "feature",
        title: "T",
        bodyFile: "/tmp/body.md",
        draft: true,
      });
      const draftArgs = mockedRunProcess.mock.calls[0]?.[1] ?? [];
      expect(draftArgs).toContain("--draft");

      mockedRunProcess.mockClear();
      yield* gh.createPullRequest({
        cwd: "/repo",
        baseBranch: "main",
        headSelector: "feature",
        title: "T",
        bodyFile: "/tmp/body.md",
      });
      const plainArgs = mockedRunProcess.mock.calls[0]?.[1] ?? [];
      expect(plainArgs).not.toContain("--draft");
    }),
  );
});
