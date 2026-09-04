import { describe, expect, test, vi } from "vitest";
import type { ProjectConfig } from "../src/config.js";
import { runProjects } from "../src/orchestrator.js";
import type { GitHubClient } from "../src/types.js";

function project(repository: string, enabled = true): ProjectConfig {
  return {
    repository,
    sourceBranch: "staging",
    targetBranch: "main",
    mergeMethod: "squash",
    enabled,
  };
}

test("continues after project failures and omits disabled projects", async () => {
  const github = {
    compareBranches: vi
      .fn()
      .mockRejectedValueOnce(new Error("API failed"))
      .mockResolvedValueOnce({ aheadBy: 0 }),
  } as unknown as GitHubClient;

  const results = await runProjects(
    github,
    [project("owner/one"), project("owner/disabled", false), project("owner/two")],
    "token",
  );

  expect(results.map(({ outcome }) => outcome)).toEqual(["failed", "no-changes"]);
  expect(github.compareBranches).toHaveBeenCalledTimes(2);
});
