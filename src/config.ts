import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

const branchSchema = z.string().trim().min(1, "Branch must not be empty");
const mergeMethodSchema = z.enum(["merge", "squash", "rebase"]);
const repositorySchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/,
    "Repository must use owner/name format",
  );

const defaultsSchema = z.strictObject({
  source_branch: branchSchema.default("staging"),
  target_branch: branchSchema.default("main"),
  merge_method: mergeMethodSchema.default("squash"),
});

const projectSchema = z.strictObject({
  repository: repositorySchema,
  source_branch: branchSchema.optional(),
  target_branch: branchSchema.optional(),
  merge_method: mergeMethodSchema.optional(),
  enabled: z.boolean().optional(),
});

const fileSchema = z.strictObject({
  defaults: defaultsSchema.prefault({}),
  projects: z.array(projectSchema).default([]),
});

export type MergeMethod = "merge" | "squash" | "rebase";

export type ProjectConfig = {
  repository: string;
  sourceBranch: string;
  targetBranch: string;
  mergeMethod: MergeMethod;
  enabled: boolean;
};

export async function loadConfig(path: string): Promise<ProjectConfig[]> {
  const contents = await readFile(path, "utf8");
  const parsed = fileSchema.parse(parse(contents));
  const seen = new Set<string>();

  return parsed.projects.map((project) => {
    const key = project.repository.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate repository: ${project.repository}`);
    }
    seen.add(key);

    const sourceBranch = project.source_branch ?? parsed.defaults.source_branch;
    const targetBranch = project.target_branch ?? parsed.defaults.target_branch;
    if (sourceBranch === targetBranch) {
      throw new Error(
        `Source and target branches must be different for ${project.repository}`,
      );
    }

    return {
      repository: project.repository,
      sourceBranch,
      targetBranch,
      mergeMethod: project.merge_method ?? parsed.defaults.merge_method,
      enabled: project.enabled ?? true,
    };
  });
}
