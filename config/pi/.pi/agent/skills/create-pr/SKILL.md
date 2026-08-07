---
name: create-pr
description: Create or prepare a GitHub pull request from the current repository and branch. Use when the user asks to open, create, draft, or prepare a PR or its description.
---

# Create PR

Create one focused pull request from the current repository while preserving the user's scope, voice, and safety constraints.

## Intent and authorization

- Treat an explicit request to **open** or **create** a PR as authorization for a normal push of the current task's non-default feature branch, if needed, followed by one `gh pr create`. Guardrails and repository rules still apply.
- A request to **prepare** or **draft a description** is local-only unless the user explicitly asks to publish it.
- Honor read-only constraints such as "don't post", "review only", or "don't push".
- PR creation does **not** authorize force-pushing, merging, closing or reopening PRs, commenting, editing unrelated PRs, changing branch protection, deploying, or publishing releases.
- Work only in the current repository unless the user explicitly names another repository.
- Ask before acting when the repository, head branch, base branch, task scope, or ownership of uncommitted changes is genuinely ambiguous.

## Inspect before mutation

1. Read the repository instructions and locate its PR template. Prefer the repository's template and preserve its section order.
2. Inspect the complete local state:
   - current branch and upstream
   - remotes and repository identity
   - `git status --short`
   - commits and diff relative to the intended base
3. Check whether the current branch already has a PR. This is read-only preparation. If one exists, report it instead of creating a duplicate; do not edit it unless requested.
4. Determine the base branch deliberately:
   - use a base explicitly named by the user;
   - for a stacked change, use the actual parent branch or PR;
   - otherwise use the repository's normal default branch.
5. Verify that `base...HEAD` contains only the intended change. Do not rebase, merge, switch branches, or retarget an existing PR merely to make creation convenient.
6. Account for every uncommitted change. When the user requested an end-to-end implementation followed by a PR, task-scoped commits are allowed. For a standalone "open a PR" request, do not silently absorb unrelated or unexplained changes.
7. Run the repository's required checks, plus proportionate checks for the changed area. Never claim a check passed unless it was run successfully.

## Title and description

- Inspect recent repository PR titles when necessary to match local conventions.
- Use a concise, specific title in the repository's established style.
- Keep the body terse, informal, and human. Avoid marketing language, generic filler, and unnecessary narration.
- Follow the PR template rather than inventing a competing format.
- Explain the reason for the change, the meaningful implementation details, and the exact validation performed.
- State skipped or failing checks honestly, including why they were not completed.
- Mention risk, rollout, compatibility, or follow-up work only when relevant.
- Do not mention AI assistance unless the user explicitly asks.
- Do not include unrelated changes just to make the PR appear more complete.

If no template exists, use this minimal structure:

```markdown
## What

<why this is needed and what changed>

## Testing

<exact checks run, or "Not run" with a reason>
```

## Publish safely

1. Ensure the task changes are committed and the working tree state is understood.
2. Push only the current non-default feature branch with a normal push. Never use `--force` or `--force-with-lease` unless the user separately and explicitly requests it and guardrails allow it.
3. Keep external mutations in separate commands. Do not chain a push, PR creation, comments, edits, or other GitHub mutations together.
4. Create exactly one PR with the selected head, base, title, body, and draft status. Use a temporary body file when it avoids quoting errors.
5. Create a draft PR only when requested or when the user explicitly establishes draft-first workflow for the task.
6. Do not add labels, reviewers, assignees, comments, or project metadata unless requested.
7. Verify the result with a read-only PR lookup and inspect local status. Verification is a follow-up check, not a second attempt to create or mutate the PR.

If GitHub is unavailable or verification fails, preserve the local state, avoid repeated mutation attempts, and report what succeeded, what remains uncertain, and the exact safe next step.

## Final response

Report concisely:

- PR title and URL, or the local description path if publication was not authorized
- base and head branches
- draft or ready status
- commits or files included at a high level
- checks run and their results
- any remaining local changes, failures, or follow-up actions
