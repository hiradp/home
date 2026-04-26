---
name: manage-upstream
description: List commits on origin/main (private home-private) that are not yet on upstream/main (public hiradp/home), so the user can pick which to publish. Use when the user asks to publish, sync, or push commits upstream, or asks "what's pending for upstream".
---

# manage-upstream

This repo has two remotes:

- `origin` → `git@github.com:hiradp/home-private.git` (private, default push target)
- `upstream` → `git@github.com:hiradp/home.git` (public)

`main` tracks `origin/main`. Some commits stay private; others should be published to `upstream/main`. This skill helps the user pick which.

## Approval rule

**Approval is required only for commands that create commits or push to a remote.** Specifically:

- `git cherry-pick …`
- `git push …` (including `--dry-run` is fine to run without approval, but the real push requires explicit confirmation)

Read-only commands run freely without per-command confirmation: `git fetch`, `git merge-base`, `git log`, `git cherry`, `git status`, `git diff`, `git show`, `git worktree add` for ephemeral previews, etc.

For each commit-creating or pushing command: show the exact command, then wait for explicit confirmation. Do not batch multiple such commands into one approval.

## Dry-run mode

If the user invokes the skill with `dry-run` (e.g. "manage-upstream dry-run", "publish dry-run", or any clear "preview only" phrasing), do not execute any mutating command. Instead:

- Run the read-only listing steps (fetch, merge-base, log, cherry) normally — no approval needed for reads.
- For the push step, **print the exact command(s) you would run** and additionally execute `git push --dry-run upstream …` so the user sees git's own report of what would be transferred without actually updating the remote.
- For cherry-pick path B, print the planned `git cherry-pick` sequence and the eventual `git push --dry-run upstream …`, but do not run the cherry-picks against the live working tree. To validate that cherry-picks apply cleanly without touching the checkout, use a temporary `git worktree add` and discard it afterward (no approval needed — it's a read-equivalent local op).
- End by asking the user whether to proceed for real (drop dry-run) or refine the selection.

Even outside explicit dry-run invocations, **always show `git push --dry-run upstream …` output and wait for approval before running the real push.** The real push is the single most consequential command in this skill; it gets two confirmations (dry-run preview, then real push).

## Steps

1. Fetch both remotes so refs are current:
   ```
   git fetch origin
   git fetch upstream
   ```

2. Find the last commit shared between `origin/main` and `upstream/main`:
   ```
   git merge-base origin/main upstream/main
   ```

3. List commits on `origin/main` that are ahead of that base (oldest → newest). Use a format that gives a concise but informative summary — SHA, subject, files-touched count + line delta, and the file list:
   ```
   git log --reverse --pretty=format:'%h %s%n%b' --shortstat --name-only <merge-base>..origin/main
   ```
   If the body (`%b`) is long, summarize it down to one sentence when presenting. Drop trailing trailers (`Co-Authored-By:` etc.) from the displayed body.

4. Also show whether `upstream/main` has anything `origin/main` doesn't (should normally be empty — flag it if not):
   ```
   git log --oneline origin/main..upstream/main
   ```

5. Present each candidate commit to the user as a numbered entry with:
   - **SHA + subject** (one line)
   - **What it does** — one short sentence synthesizing subject + body. Lead with the verb. Mention the user-visible effect, not the mechanics, unless the mechanics are the point.
   - **Files** — comma-separated list, or `N files` + the top 3–5 if the list is long
   - **Size** — `+X / -Y` from shortstat
   - **Snippet** — a short, representative code excerpt (≤ ~10 lines) that shows the *essence* of the change. Read the diff with `git show <sha>` and pick the most informative hunk — typically the new function signature, the changed config key, the new branch of logic — not necessarily the first hunk. Skip pure deletions, formatting churn, lockfile updates, and trailing context. If the change is mostly a config key or one-line edit, show that one line. Render the snippet as a fenced code block with the right language tag.

   Then list the merge-base SHA + subject as "last published" for context, and ask which commits to publish. Do **not** push yet — the push mechanism is a separate decision (see below).

   Example entry:
   ```
   3. 11249f7 feat(claude): add create-pr skill
      Adds a project-scoped skill that opens a PR via gh, using the repo's PR template and checking branch-name conventions.
      Files: .claude/skills/create-pr/SKILL.md
      Size: +84 / -0
      Snippet:
      ```markdown
      ---
      name: create-pr
      description: Open a PR via gh using the repo's template and branch-name rules
      ---
      ```
   ```

## Push mechanism — not yet decided

The user wants to brainstorm this separately. Do not push to `upstream` until the mechanism is agreed on. Candidates under consideration:

- Direct ref push (`git push upstream <sha>:main`) — only works if selected commits form a contiguous prefix from `upstream/main`; preserves SHAs.
- Cherry-pick onto a branch from `upstream/main`, then push — works for arbitrary subsets; creates new SHAs.
- A dedicated `publish` branch tracking what's been published — more bookkeeping, cleaner audit trail.

When the user invokes the skill, stop after step 5 and wait for their selection + push-mechanism decision.
