import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createGitHubClient } from "./github.js";
import { runProjects } from "./orchestrator.js";
import { renderSummary } from "./summary.js";
import type { GitHubClient } from "./types.js";

type ExecuteOptions = {
  token: string;
  configPath: string;
  writeSummary: (markdown: string) => Promise<void>;
  clientFactory: (token: string) => GitHubClient;
};

export async function execute(options: ExecuteOptions): Promise<number> {
  if (!options.token) {
    throw new Error("AUTO_MR_TOKEN is required.");
  }
  const projects = await loadConfig(options.configPath);
  const client = options.clientFactory(options.token);
  const results = await runProjects(client, projects, options.token);
  await options.writeSummary(renderSummary(results));
  return results.some(({ outcome }) => outcome === "failed") ? 1 : 0;
}

async function writeActionsSummary(markdown: string): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) {
    await appendFile(path, markdown);
  } else {
    process.stdout.write(markdown);
  }
}

async function main(): Promise<void> {
  process.exitCode = await execute({
    token: process.env.AUTO_MR_TOKEN ?? "",
    configPath: process.env.AUTO_MR_CONFIG ?? "config/projects.yml",
    writeSummary: writeActionsSummary,
    clientFactory: createGitHubClient,
  });
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`auto-mr: ${message}\n`);
    process.exitCode = 1;
  });
}
