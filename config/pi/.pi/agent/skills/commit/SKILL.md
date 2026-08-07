---
name: commit
description: Inspect, organize, create, split, squash, or reword local Git commits while accounting for every repository change. Use when the user asks for commit management, focused commits, history cleanup, or help preparing local history.
---

# Commit

Create coherent local history without losing work, hiding remaining changes, or performing remote actions.

## Scope and authorization

- Work only in the current Git repository unless the user explicitly names another repository.
- Keep this workflow local-only. Do not push, create or edit pull requests, merge remote branches, publish, or deploy. PR publication belongs to the `create-pr` skill.
- Treat a broad request such as "do some commit management" as authorization to inspect the repository and propose a plan, not to create commits immediately.
- Treat an explicit request such as "commit these changes", "commit please", or approval of a proposed plan as authorization to create the described local commits.
- Rewrite commits only when the user explicitly asks to split, squash, reorder, fix up, or reword history.
- Never discard work. Do not use `git reset --hard`, `git clean`, destructive checkout or restore commands, or an implicit stash.
- Do not bypass repository hooks or safety controls with flags such as `--no-verify`.
- Do not commit protected guardrail settings or sources. If policy blocks a change, report it once and leave it untouched.

## Inventory the complete state

Before proposing or creating commits:

1. Read repository instructions and inspect recent commit history to learn the local message style.
2. Identify:
   - current branch and whether it is the default branch;
   - upstream and ahead/behind state;
   - staged, unstaged, and untracked files;
   - local commits relative to the intended base;
   - submodule or nested-repository changes, when present.
3. Review both staged and unstaged diffs. Inspect untracked files before staging them, but do not open credential-bearing or sensitive files merely to classify them.
4. Account for generated files, lockfiles, tests, documentation, and deletions—not only the main source changes.
5. Separate pre-existing or unrelated work from changes belonging to the current task. Do not assume that every dirty file should be committed.
6. If checks or formatting commands modify files, inventory the repository again before committing.

Do not scan enormous ignored trees. Report an ignored file only when it was mentioned by the user, produced by the task, or is otherwise directly relevant.

## Build the commit plan

Group changes by intent rather than by file type alone:

- Keep implementation and the tests that validate it together.
- Keep a dependency manifest and its lockfile update together.
- Keep generated artifacts with the source change that requires them.
- Split unrelated tools, features, fixes, or configuration areas.
- Avoid splitting changes that only build, test, or make sense together.
- Do not create cosmetic micro-commits unless the repository convention calls for them.

For an audit-only request, present a plan containing:

- proposed commit order;
- exact commit messages;
- files or hunks assigned to each commit;
- checks to run;
- changes intentionally left out, with reasons.

Ask before execution only when authorization or grouping remains ambiguous. Do not ask again after the user explicitly approves the plan.

## Stage precisely

- Stage explicit paths when a commit owns whole files.
- Do not use `git add -A` or `git add .` unless every visible change belongs to one approved commit.
- When a file contains changes for multiple commits, stage a reviewed patch or hunks carefully and verify both the index and remaining working-tree diff.
- Never modify source semantics merely to manufacture a cleaner split.
- Never stage ignored files, likely secrets, local credentials, `.env` files, or machine-specific state without explicit authorization and applicable guardrail approval.
- Preserve executable bits, renames, deletions, and symlinks intentionally.

Before each commit:

1. Review `git diff --cached --stat` and the full staged diff.
2. Run `git diff --cached --check`.
3. Confirm the staged content matches exactly one planned intent.
4. Ensure no unrelated changes are staged.

## Commit Message Rules

Write the message as a single short line. Target under 50 characters, hard max 72.

Voice and tone:
- Write like a human jotting a note, not an AI summarizing a diff
- Lowercase unless a proper noun
- No period at the end
- Imperative mood ("fix crash" not "fixed crash" or "fixes crash")

Content:
- State what changed at a high level, not how
- One line. No body, no bullet lists, no paragraphs
- Only add a body (separated by blank line) if the change is genuinely complex AND the "why" isn't obvious from the diff — this should be rare
- When a body is warranted, keep it to 1-3 short sentences. Never bullet lists.

What to avoid:
- Never list files or functions changed
- Never describe every individual change
- Never use filler like "various improvements" or "minor updates"
- Never wrap the message in quotes when passing to git commit -m
- Never add AI, robot, or coauthor trailers unless explicitly requested.
- Never amend an existing commit

Repository patterns:
- Follow repository instructions and recent history rather than imposing one global format.
- When the repository uses Conventional Commits, choose the narrowest accurate type and scope.

## Validate the result

- Run required repository checks and proportionate checks for each logical area.
- Prefer every commit to be coherent and buildable when practical.
- Never claim a check passed unless it completed successfully.
- If a hook or check fails, preserve the staged and working state, diagnose it, and either fix only task-scoped mechanical issues or report the blocker. Do not bypass the check.
- After every commit, inspect the resulting commit and repository status before moving to the next one.

## Rewrite history safely

History editing requires explicit user intent.

- Do not rewrite the default branch.
- Do not rewrite commits known to be published or shared unless the user separately confirms that exact rewrite and its consequences.
- Treat stale remote-tracking information as uncertain; do not assume a commit is unpublished merely because a local upstream ref does not contain it.
- Before a multi-commit rewrite, create and report a clearly named local recovery ref when repository policy permits.
- Use the least destructive operation that achieves the requested split, squash, reorder, fixup, or reword.
- Never delete the recovery ref automatically.
- After rewriting, compare the new range with the original range and verify that no content was lost.
- Do not push rewritten history. Report that publication would require a separate, explicitly authorized workflow.

On a default branch, new local commits are allowed only when the user explicitly requested them and repository policy permits them; rewriting default-branch history is not.

## Reconcile every change

Before saying the work is complete, inspect status again and classify every remaining staged, unstaged, or untracked path as one of:

- committed;
- intentionally left for another commit or task;
- unrelated pre-existing work;
- protected or blocked by policy;
- unresolved because user input is required.

Only say "working tree clean" when Git reports no staged, unstaged, or untracked changes. Distinguish that from ignored local files, which are outside normal status reporting.

## Final response

Report concisely:

```text
Created:
- <hash> <subject>

Rewritten:
- <old range> -> <new range>
- Recovery ref: <name>

Remaining:
- <path> — <reason>

Checks:
- <command> — <result>

Branch:
- <branch>; <ahead/behind summary>

Push:
- Not performed
```

Omit empty sections, but always include remaining changes, check results, branch state, and the fact that no push occurred.
