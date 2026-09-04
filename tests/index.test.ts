import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { execute } from "../src/index.js";
import type { GitHubClient } from "../src/types.js";

async function config(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "auto-mr-index-"));
  const path = join(directory, "projects.yml");
  await writeFile(path, "projects:\n  - repository: owner/api\n");
  return path;
}

test("requires AUTO_MR_TOKEN", async () => {
  await expect(execute({
    token: "",
    configPath: await config(),
    writeSummary: vi.fn(),
    clientFactory: vi.fn(),
  })).rejects.toThrow("AUTO_MR_TOKEN");
});

test("writes a summary and returns failure after processing errors", async () => {
  const writeSummary = vi.fn().mockResolvedValue(undefined);
  const github = {
    compareBranches: vi.fn().mockRejectedValue(new Error("API unavailable")),
  } as unknown as GitHubClient;

  const exitCode = await execute({
    token: "secret",
    configPath: await config(),
    writeSummary,
    clientFactory: () => github,
  });

  expect(exitCode).toBe(1);
  expect(writeSummary).toHaveBeenCalledWith(expect.stringContaining("API unavailable"));
});
