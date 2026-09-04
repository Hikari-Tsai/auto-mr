import { Octokit } from "@octokit/rest";
import type { MergeMethod } from "./config.js";
import type {
  GitHubClient,
  MergeState,
  PullRequestInfo,
} from "./types.js";

type ApiResponse = { data: any };
type OctokitApi = {
  repos: {
    compareCommitsWithBasehead(input: object): Promise<ApiResponse>;
  };
  pulls: {
    list(input: object): Promise<ApiResponse>;
    create(input: object): Promise<ApiResponse>;
    get(input: object): Promise<ApiResponse>;
    merge(input: object): Promise<ApiResponse>;
  };
  graphql(query: string, variables: object): Promise<unknown>;
};

function mergeState(data: any): MergeState {
  if (data.draft) return "draft";
  const value = String(data.mergeable_state ?? "unknown").toLowerCase();
  const states: MergeState[] = [
    "clean",
    "blocked",
    "dirty",
    "behind",
    "unstable",
    "unknown",
  ];
  return states.includes(value as MergeState) ? (value as MergeState) : "unknown";
}

function pullRequest(data: any): PullRequestInfo {
  return {
    number: data.number,
    url: data.html_url,
    nodeId: data.node_id,
    mergeState: mergeState(data),
    autoMergeEnabled: data.auto_merge != null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

const AUTO_MERGE_MUTATION = `
  mutation EnableAutoMerge(
    $pullRequestId: ID!
    $mergeMethod: PullRequestMergeMethod!
  ) {
    enablePullRequestAutoMerge(input: {
      pullRequestId: $pullRequestId
      mergeMethod: $mergeMethod
    }) {
      pullRequest { id }
    }
  }
`;

export function createGitHubClient(
  token: string,
  suppliedApi?: OctokitApi,
): GitHubClient {
  const api = suppliedApi ?? (new Octokit({ auth: token }) as unknown as OctokitApi);

  return {
    async compareBranches(input) {
      const response = await api.repos.compareCommitsWithBasehead({
        owner: input.owner,
        repo: input.repo,
        basehead: `${input.base}...${input.head}`,
      });
      return { aheadBy: response.data.ahead_by };
    },

    async findOpenPullRequest(input) {
      const response = await api.pulls.list({
        owner: input.owner,
        repo: input.repo,
        state: "open",
        head: `${input.owner}:${input.head}`,
        base: input.base,
        per_page: 1,
      });
      const first = response.data[0];
      return first ? pullRequest(first) : null;
    },

    async createPullRequest(input) {
      const response = await api.pulls.create(input);
      return pullRequest(response.data);
    },

    async getPullRequest(input) {
      const response = await api.pulls.get({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
      });
      return pullRequest(response.data);
    },

    async mergePullRequest(input) {
      try {
        const response = await api.pulls.merge({
          owner: input.owner,
          repo: input.repo,
          pull_number: input.number,
          merge_method: input.method,
        });
        return {
          merged: Boolean(response.data.merged),
          message: response.data.message,
        };
      } catch (error) {
        if (errorStatus(error) === 404) {
          const response = await api.pulls.get({
            owner: input.owner,
            repo: input.repo,
            pull_number: input.number,
          });
          if (response.data.merged) return { merged: false, alreadyMerged: true };
        }
        if ([405, 409].includes(errorStatus(error) ?? 0)) {
          return { merged: false, message: errorMessage(error) };
        }
        throw error;
      }
    },

    async enableAutoMerge(input) {
      const methods: Record<MergeMethod, string> = {
        merge: "MERGE",
        squash: "SQUASH",
        rebase: "REBASE",
      };
      try {
        await api.graphql(AUTO_MERGE_MUTATION, {
          pullRequestId: input.nodeId,
          mergeMethod: methods[input.method],
        });
        return true;
      } catch (error) {
        const message = errorMessage(error);
        if (/auto.?merge|clean status|not enabled|not allowed/i.test(message)) {
          return false;
        }
        throw error;
      }
    },
  };
}
