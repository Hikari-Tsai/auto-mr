import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

async function configFile(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "auto-mr-"));
  const path = join(directory, "projects.yml");
  await writeFile(path, contents);
  return path;
}

describe("loadConfig", () => {
  test("applies defaults and project overrides", async () => {
    const path = await configFile(`
defaults:
  source_branch: staging
  target_branch: main
  merge_method: squash
projects:
  - repository: owner/api
  - repository: owner/web
    source_branch: preview
    merge_method: rebase
    enabled: false
`);

    await expect(loadConfig(path)).resolves.toEqual([
      {
        repository: "owner/api",
        sourceBranch: "staging",
        targetBranch: "main",
        mergeMethod: "squash",
        enabled: true,
      },
      {
        repository: "owner/web",
        sourceBranch: "preview",
        targetBranch: "main",
        mergeMethod: "rebase",
        enabled: false,
      },
    ]);
  });

  test.each([
    ["unknown keys", "projects:\n  - repository: owner/api\n    surprise: true", "Unrecognized key"],
    ["invalid repository", "projects:\n  - repository: missing-slash", "owner/name"],
    ["same branches", "projects:\n  - repository: owner/api\n    source_branch: main\n    target_branch: main", "must be different"],
    ["duplicates", "projects:\n  - repository: owner/api\n  - repository: owner/api", "Duplicate repository"],
  ])("rejects %s", async (_name, yaml, message) => {
    const path = await configFile(yaml);
    await expect(loadConfig(path)).rejects.toThrow(message);
  });
});
