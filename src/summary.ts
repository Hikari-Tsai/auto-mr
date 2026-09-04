import type { PromotionResult } from "./types.js";

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ").trim();
}

export function sanitizeError(error: unknown, secret = ""): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutKnownSecret = secret ? raw.replaceAll(secret, "[REDACTED]") : raw;
  return withoutKnownSecret.replace(
    /\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)\b/g,
    "[REDACTED]",
  );
}

export function renderSummary(results: PromotionResult[]): string {
  const header = [
    "# Auto MR results",
    "",
    "| Repository | Branches | Outcome | Pull request | Detail |",
    "| --- | --- | --- | --- | --- |",
  ];
  const rows = results.map((item) => {
    const pullRequest =
      item.url && item.number ? `[#${item.number}](${item.url})` : "—";
    return `| ${escapeCell(item.project.repository)} | ${escapeCell(item.project.sourceBranch)} → ${escapeCell(item.project.targetBranch)} | ${item.outcome} | ${pullRequest} | ${escapeCell(item.detail)} |`;
  });
  return [...header, ...rows, ""].join("\n");
}
