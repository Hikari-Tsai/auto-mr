import { describe, expect, test, vi } from "vitest";
import { createGitHubClient } from "../src/github.js";

function api() {
  return {
    repos: {
      compareCommitsWithBasehead: vi.fn().mockResolvedValue({
        data: { ahead_by: 3 },
      }),
    },
    pulls: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({
        data: {
          number: 4,
          html_url: "https://github.com/owner/api/pull/4",
          node_id: "node",
          mergeable_state: "blocked",
          auto_merge: null,
          draft: false,
          merged: false,
        },
      }),
      merge: vi.fn().mockResolvedValue({
        data: { merged: true, message: "Pull Request successfully merged" },
      }),
    },
    graphql: vi.fn().mockResolvedValue({}),
  };
}

describe("createGitHubClient", () => {
  test("maps compare and pull-request responses", async () => {
    const octokit = api();
    const client = createGitHubClient("token", octokit);

    await expect(client.compareBranches({
      owner: "owner",
      repo: "api",
      base: "main",
      head: "staging",
    })).resolves.toEqual({ aheadBy: 3 });
    await expect(client.getPullRequest({
      owner: "owner",
      repo: "api",
      number: 4,
    })).resolves.toMatchObject({ mergeState: "blocked", autoMergeEnabled: false });
  });

  test("enables auto-merge with the configured method", async () => {
    const octokit = api();
    const client = createGitHubClient("token", octokit);

    await expect(client.enableAutoMerge({ nodeId: "node", method: "squash" }))
      .resolves.toBe(true);
    expect(octokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("enablePullRequestAutoMerge"),
      { pullRequestId: "node", mergeMethod: "SQUASH" },
    );
  });

  test("returns false when native auto-merge is unavailable", async () => {
    const octokit = api();
    octokit.graphql.mockRejectedValue(new Error("Auto-merge is not enabled"));
    const client = createGitHubClient("token", octokit);

    await expect(client.enableAutoMerge({ nodeId: "node", method: "merge" }))
      .resolves.toBe(false);
  });

  test("does not hide unexpected GraphQL failures", async () => {
    const octokit = api();
    octokit.graphql.mockRejectedValue(new Error("Bad credentials"));
    const client = createGitHubClient("token", octokit);

    await expect(client.enableAutoMerge({ nodeId: "node", method: "merge" }))
      .rejects.toThrow("Bad credentials");
  });
});
