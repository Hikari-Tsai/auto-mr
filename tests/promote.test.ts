import { describe, expect, test, vi } from "vitest";
import type { ProjectConfig } from "../src/config.js";
import { promoteProject } from "../src/promote.js";
import type { GitHubClient, PullRequestInfo } from "../src/types.js";

const project: ProjectConfig = {
  repository: "owner/api",
  sourceBranch: "staging",
  targetBranch: "main",
  mergeMethod: "squash",
  enabled: true,
};

const pullRequest: PullRequestInfo = {
  number: 12,
  url: "https://github.com/owner/api/pull/12",
  nodeId: "PR_node",
  mergeState: "blocked",
  autoMergeEnabled: false,
};

function client(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    compareBranches: vi.fn().mockResolvedValue({ aheadBy: 2 }),
    findOpenPullRequest: vi.fn().mockResolvedValue(pullRequest),
    createPullRequest: vi.fn().mockResolvedValue(pullRequest),
    getPullRequest: vi.fn().mockResolvedValue(pullRequest),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true }),
    enableAutoMerge: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("promoteProject", () => {
  test("skips repositories with no commits ahead", async () => {
    const github = client({
      compareBranches: vi.fn().mockResolvedValue({ aheadBy: 0 }),
    });

    await expect(promoteProject(github, project)).resolves.toMatchObject({
      outcome: "no-changes",
    });
    expect(github.findOpenPullRequest).not.toHaveBeenCalled();
  });

  test("reuses an existing pull request", async () => {
    const github = client();

    const result = await promoteProject(github, project);

    expect(github.createPullRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({ number: 12, outcome: "auto-merge-enabled" });
  });

  test("creates a pull request when none exists", async () => {
    const github = client({
      findOpenPullRequest: vi.fn().mockResolvedValue(null),
    });

    await promoteProject(github, project);

    expect(github.createPullRequest).toHaveBeenCalledWith({
      owner: "owner",
      repo: "api",
      head: "staging",
      base: "main",
      title: "Promote staging to main",
      body: expect.stringContaining("automatically created"),
    });
  });

  test("merges immediately when GitHub reports a clean state", async () => {
    const clean = { ...pullRequest, mergeState: "clean" as const };
    const github = client({
      findOpenPullRequest: vi.fn().mockResolvedValue(clean),
      getPullRequest: vi.fn().mockResolvedValue(clean),
    });

    await expect(promoteProject(github, project)).resolves.toMatchObject({
      outcome: "merged",
    });
    expect(github.mergePullRequest).toHaveBeenCalledWith({
      owner: "owner",
      repo: "api",
      number: 12,
      method: "squash",
    });
  });

  test("waits when repository auto-merge is unavailable", async () => {
    const github = client({
      enableAutoMerge: vi.fn().mockResolvedValue(false),
    });

    await expect(promoteProject(github, project)).resolves.toMatchObject({
      outcome: "waiting",
    });
  });

  test("treats an already enabled auto-merge as waiting", async () => {
    const enabled = { ...pullRequest, autoMergeEnabled: true };
    const github = client({
      findOpenPullRequest: vi.fn().mockResolvedValue(enabled),
      getPullRequest: vi.fn().mockResolvedValue(enabled),
    });

    await expect(promoteProject(github, project)).resolves.toMatchObject({
      outcome: "waiting",
    });
    expect(github.enableAutoMerge).not.toHaveBeenCalled();
  });

  test("reports conflicts without modifying branches", async () => {
    const conflicted = { ...pullRequest, mergeState: "dirty" as const };
    const github = client({
      findOpenPullRequest: vi.fn().mockResolvedValue(conflicted),
      getPullRequest: vi.fn().mockResolvedValue(conflicted),
    });

    await expect(promoteProject(github, project)).resolves.toMatchObject({
      outcome: "conflict",
    });
    expect(github.mergePullRequest).not.toHaveBeenCalled();
    expect(github.enableAutoMerge).not.toHaveBeenCalled();
  });

  test("tolerates a pull request merged by another actor", async () => {
    const clean = { ...pullRequest, mergeState: "clean" as const };
    const github = client({
      findOpenPullRequest: vi.fn().mockResolvedValue(clean),
      getPullRequest: vi.fn().mockResolvedValue(clean),
      mergePullRequest: vi.fn().mockResolvedValue({
        merged: false,
        alreadyMerged: true,
      }),
    });

    await expect(promoteProject(github, project)).resolves.toMatchObject({
      outcome: "merged",
    });
  });
});
