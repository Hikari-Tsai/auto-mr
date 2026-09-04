# Auto MR Design

## Goal

Create a central GitHub Actions repository that checks a configured set of repositories every day at 08:00 Asia/Taipei, opens a pull request from each repository's staging branch to its main branch when changes exist, and arranges for the pull request to merge after that repository's required CI, review, deployment, and branch-protection conditions are satisfied.

The first version targets repositories owned by one personal GitHub account. It uses a fine-grained personal access token (PAT), while keeping authentication behind a small boundary so a GitHub App can replace it later.

## Scope

The system will:

- Run daily at 08:00 Asia/Taipei and by manual dispatch.
- Read project definitions from a version-controlled YAML file.
- Compare a configurable source branch with a configurable target branch.
- Reuse an existing open pull request for the same branch pair.
- Create a pull request only when the source contains changes not present in the target.
- Enable native GitHub auto-merge when the target repository permits it.
- Leave pull requests open indefinitely while required human approval or checks are pending.
- Isolate failures so one repository does not prevent other repositories from being processed.
- Produce a GitHub Actions job summary for every run.

The first version will not:

- Modify branch protection, rulesets, repository settings, or CI configuration.
- Bypass reviews or other merge requirements.
- Automatically resolve merge conflicts.
- Push commits or synchronize branches.
- Install or configure a GitHub App.
- Send notifications outside GitHub Actions.

## Repository Structure

```text
auto-mr/
├── .github/
│   └── workflows/
│       └── promote.yml
├── config/
│   └── projects.yml
├── docs/
│   └── superpowers/specs/
├── src/
│   ├── config.ts
│   ├── github.ts
│   ├── promote.ts
│   └── index.ts
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

The implementation will use TypeScript on the Node.js runtime supplied by GitHub-hosted runners. GitHub API operations will use Octokit. YAML configuration will be schema-validated before any repository is changed.

## Configuration

Non-secret project configuration will live in `config/projects.yml`:

```yaml
defaults:
  source_branch: staging
  target_branch: main
  merge_method: squash

projects:
  - repository: example-user/service-a

  - repository: example-user/service-b
    source_branch: pre-production
    merge_method: merge

  - repository: example-user/paused-project
    enabled: false
```

Supported fields:

- `repository`: required `owner/name` identifier.
- `source_branch`: optional override; defaults to `staging`.
- `target_branch`: optional override; defaults to `main`.
- `merge_method`: `merge`, `squash`, or `rebase`.
- `enabled`: optional boolean; defaults to `true`.

Unknown fields, duplicate repositories, invalid repository names, identical source and target branches, and unsupported merge methods will fail configuration validation before processing begins.

The token will be stored only as the `AUTO_MR_TOKEN` GitHub Actions repository secret. It will never appear in YAML, source code, logs, test fixtures, or generated summaries.

## Authentication and Permissions

Version one uses a fine-grained PAT whose resource owner is the user's personal account. The token is restricted to selected repositories and receives only:

- Metadata: read-only.
- Contents: read-only.
- Pull requests: read and write.

The workflow repository's built-in `GITHUB_TOKEN` is insufficient because it is limited to that repository. The application will accept the credential through an environment variable at startup. GitHub-specific authentication construction remains in `src/github.ts`, allowing a future GitHub App installation token provider without changing project configuration or promotion logic.

PAT creation remains a manual user operation because GitHub exposes the credential only to the authenticated account holder. The README will document token creation, selected permissions, secret installation, expiration, and rotation.

## Scheduled Workflow

The workflow will run at a non-hour boundary to reduce peak scheduling delays:

```yaml
on:
  schedule:
    - cron: "0 8 * * *"
      timezone: "Asia/Taipei"
  workflow_dispatch:
```

A workflow-level concurrency group will allow only one promotion run at a time. A newer scheduled run will not cancel an active run, preventing a partially processed project list from being abandoned.

The workflow will install locked dependencies, build the TypeScript source, run tests, and then execute the promotion command. The schedule uses UTC, as required by GitHub Actions.

## Promotion Flow

For every enabled project, the orchestrator will:

1. Parse the repository owner and name.
2. Confirm both configured branches exist and are accessible.
3. Compare the target branch with the source branch.
4. Skip the project when the source has no commits to promote.
5. Search for an open pull request whose head and base match the configured pair.
6. Reuse that pull request if one exists; otherwise create one with a deterministic title and explanatory body.
7. Inspect the pull request's current state.
8. If already mergeable and all repository requirements permit merging, request the configured merge method.
9. If requirements are pending and native auto-merge is available, enable auto-merge with the configured method.
10. If native auto-merge is disabled at repository level, leave the PR open and retry the merge on the next scheduled run.
11. Record the outcome in the run summary.

Native auto-merge gives immediate merging after a later human approval or CI completion. Repositories intended to receive that behavior must enable **Settings → General → Pull Requests → Allow auto-merge**. The periodic retry is a safe fallback, but may merge up to one day after requirements become satisfied.

All merge requests go through GitHub's normal merge API. Branch protection and rulesets remain authoritative; the program does not request bypass privileges.

## Idempotency and Concurrency

The branch pair is the idempotency key. Before creating a PR, the program queries open PRs using the exact owner-qualified head branch and target branch. It will never create a second PR when a matching open PR exists.

Workflow concurrency prevents overlapping central runs. GitHub remains the source of truth if a user creates, closes, or merges a PR while a run is active. Before a merge or auto-merge mutation, the program will re-read the PR and tolerate benign races such as an already-merged PR.

## Results and Error Handling

Each project produces one of these outcomes:

- `no-changes`
- `pr-created`
- `waiting`
- `auto-merge-enabled`
- `merged`
- `conflict`
- `failed`

Expected waiting states, including pending CI and missing approval, are successful outcomes. Merge conflicts are reported but not modified. Authentication failures, missing branches, invalid configuration, disabled merge methods, and API errors include a concise message without credential or response-header leakage.

Project-level failures are collected while remaining projects continue. The command exits non-zero after processing if any project has a true failure. The GitHub Actions summary lists repository, branch pair, PR link when available, outcome, and sanitized detail.

## Testing

Automated tests will cover:

- Configuration defaults, overrides, and invalid input.
- No-change behavior.
- Existing-PR reuse and duplicate prevention.
- New PR creation.
- Immediate merge when permitted.
- Native auto-merge when requirements are pending.
- Waiting fallback when repository auto-merge is disabled.
- Pending human review as a non-error state.
- Merge conflicts and per-project API failures.
- Secret redaction and summary rendering.

GitHub API calls will be represented by a narrow interface and mocked in unit tests. A manual `workflow_dispatch` run against one selected test repository will be the final integration verification after the user installs the PAT secret.

## Operational Setup

To add a repository:

1. Grant the fine-grained PAT access to the repository.
2. Add the repository to `config/projects.yml`.
3. Enable native auto-merge in the target repository if immediate post-approval merging is desired.
4. Merge the configuration change into the workflow repository's default branch.

Token rotation consists of generating a replacement with the same repository selection and permissions, replacing `AUTO_MR_TOKEN`, manually dispatching a validation run, and revoking the old token.

## Future Migration to GitHub App

If repositories later span organizations, replace PAT construction in the authentication boundary with GitHub App JWT and per-installation access-token generation. The project schema, promotion state machine, tests, workflow schedule, and summary format remain unchanged. App installation mapping should be discovered dynamically from each repository rather than added to `projects.yml`.
