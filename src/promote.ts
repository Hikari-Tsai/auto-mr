import type { ProjectConfig } from "./config.js";
import type {
  GitHubClient,
  PromotionResult,
  PullRequestInfo,
} from "./types.js";

function result(
  project: ProjectConfig,
  outcome: PromotionResult["outcome"],
  detail: string,
  pullRequest?: PullRequestInfo,
): PromotionResult {
  return {
    project,
    outcome,
    detail,
    ...(pullRequest
      ? { number: pullRequest.number, url: pullRequest.url }
      : {}),
  };
}

export async function promoteProject(
  client: GitHubClient,
  project: ProjectConfig,
): Promise<PromotionResult> {
  const [owner, repo] = project.repository.split("/") as [string, string];
  const coordinates = { owner, repo };
  const comparison = await client.compareBranches({
    ...coordinates,
    base: project.targetBranch,
    head: project.sourceBranch,
  });

  if (comparison.aheadBy === 0) {
    return result(project, "no-changes", "Source branch has no changes to promote.");
  }

  let pullRequest = await client.findOpenPullRequest({
    ...coordinates,
    head: project.sourceBranch,
    base: project.targetBranch,
  });

  if (!pullRequest) {
    pullRequest = await client.createPullRequest({
      ...coordinates,
      head: project.sourceBranch,
      base: project.targetBranch,
      title: `Promote ${project.sourceBranch} to ${project.targetBranch}`,
      body:
        "This pull request was automatically created by auto-mr. " +
        "GitHub branch protections, required checks, and reviews remain authoritative.",
    });
  }

  pullRequest = await client.getPullRequest({
    ...coordinates,
    number: pullRequest.number,
  });

  if (pullRequest.mergeState === "dirty") {
    return result(project, "conflict", "The branch pair has merge conflicts.", pullRequest);
  }

  if (pullRequest.mergeState === "clean") {
    const merge = await client.mergePullRequest({
      ...coordinates,
      number: pullRequest.number,
      method: project.mergeMethod,
    });
    if (merge.merged || merge.alreadyMerged) {
      return result(project, "merged", "Pull request merged.", pullRequest);
    }
    return result(
      project,
      "waiting",
      merge.message ?? "GitHub did not permit the merge yet.",
      pullRequest,
    );
  }

  if (pullRequest.autoMergeEnabled) {
    return result(
      project,
      "waiting",
      "Auto-merge is already enabled; waiting for repository requirements.",
      pullRequest,
    );
  }

  const enabled = await client.enableAutoMerge({
    nodeId: pullRequest.nodeId,
    method: project.mergeMethod,
  });
  return enabled
    ? result(
        project,
        "auto-merge-enabled",
        "Auto-merge enabled; waiting for repository requirements.",
        pullRequest,
      )
    : result(
        project,
        "waiting",
        "Repository auto-merge is unavailable; a later schedule will retry.",
        pullRequest,
      );
}
