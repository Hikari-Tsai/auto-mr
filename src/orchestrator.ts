import type { ProjectConfig } from "./config.js";
import { promoteProject } from "./promote.js";
import { sanitizeError } from "./summary.js";
import type { GitHubClient, PromotionResult } from "./types.js";

export async function runProjects(
  client: GitHubClient,
  projects: ProjectConfig[],
  secret = "",
): Promise<PromotionResult[]> {
  const results: PromotionResult[] = [];
  for (const project of projects) {
    if (!project.enabled) continue;
    try {
      results.push(await promoteProject(client, project));
    } catch (error) {
      results.push({
        project,
        outcome: "failed",
        detail: sanitizeError(error, secret),
      });
    }
  }
  return results;
}
