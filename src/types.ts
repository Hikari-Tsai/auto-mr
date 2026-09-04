import type { MergeMethod, ProjectConfig } from "./config.js";

export type MergeState =
  | "clean"
  | "blocked"
  | "dirty"
  | "behind"
  | "draft"
  | "unstable"
  | "unknown";

export type PullRequestInfo = {
  number: number;
  url: string;
  nodeId: string;
  mergeState: MergeState;
  autoMergeEnabled: boolean;
};

export type PullRequestCoordinates = {
  owner: string;
  repo: string;
  number: number;
};

export interface GitHubClient {
  compareBranches(input: {
    owner: string;
    repo: string;
    base: string;
    head: string;
  }): Promise<{ aheadBy: number }>;
  findOpenPullRequest(input: {
    owner: string;
    repo: string;
    head: string;
    base: string;
  }): Promise<PullRequestInfo | null>;
  createPullRequest(input: {
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequestInfo>;
  getPullRequest(input: PullRequestCoordinates): Promise<PullRequestInfo>;
  mergePullRequest(
    input: PullRequestCoordinates & { method: MergeMethod },
  ): Promise<{ merged: boolean; alreadyMerged?: boolean; message?: string }>;
  enableAutoMerge(input: {
    nodeId: string;
    method: MergeMethod;
  }): Promise<boolean>;
}

export type PromotionOutcome =
  | "no-changes"
  | "pr-created"
  | "waiting"
  | "auto-merge-enabled"
  | "merged"
  | "conflict"
  | "failed";

export type PromotionResult = {
  project: ProjectConfig;
  outcome: PromotionOutcome;
  detail: string;
  number?: number;
  url?: string;
};
