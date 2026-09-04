import { describe, expect, test } from "vitest";
import type { ProjectConfig } from "../src/config.js";
import { renderSummary, sanitizeError } from "../src/summary.js";
import type { PromotionResult } from "../src/types.js";

const project: ProjectConfig = {
  repository: "owner/api",
  sourceBranch: "staging",
  targetBranch: "main",
  mergeMethod: "squash",
  enabled: true,
};

describe("renderSummary", () => {
  test("renders project results and PR links", () => {
    const results: PromotionResult[] = [{
      project,
      outcome: "waiting",
      detail: "Needs approval",
      number: 7,
      url: "https://github.com/owner/api/pull/7",
    }];

    expect(renderSummary(results)).toContain(
      "| owner/api | staging → main | waiting | [#7](https://github.com/owner/api/pull/7) | Needs approval |",
    );
  });

  test("escapes table-breaking Markdown", () => {
    const results: PromotionResult[] = [{
      project,
      outcome: "failed",
      detail: "bad | value\nnext line",
    }];

    const summary = renderSummary(results);
    expect(summary).toContain("bad \\| value next line");
  });
});

describe("sanitizeError", () => {
  test("redacts the credential", () => {
    const secret = "github_pat_sensitive";
    expect(sanitizeError(new Error(`Rejected ${secret}`), secret)).toBe(
      "Rejected [REDACTED]",
    );
  });
});
