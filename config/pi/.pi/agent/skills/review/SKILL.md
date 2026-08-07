---
name: review
description: Review a pull request, current diff, branch, file, or design document for correctness, safety, tests, compatibility, and operational impact. Use for initial reviews and focused re-reviews; remain read-only unless the user explicitly asks to fix findings.
---

# Review

Perform a findings-first technical review grounded in the repository and the exact target under review.

## Default to read-only

- Treat every review request as read-only unless the user explicitly asks to fix, apply, or address findings.
- In read-only mode, do not edit or write repository files, stage or commit changes, switch branches, rewrite history, push, or perform any remote mutation.
- Never post a review, comment, approval, requested-changes verdict, label, edit, merge, close, reopen, or workflow rerun on GitHub.
- Use only read-only GitHub operations such as PR metadata lookup, diff retrieval, checks inspection, and GET requests.
- Do not use `gh pr checkout` or otherwise alter the current checkout for a PR review. Inspect the PR diff, immutable head/base SHAs, and relevant blobs through read-only local or GitHub access.
- Run only non-destructive local checks that are appropriate for the repository and target. Honor stricter instructions such as "don't run anything" or "review only".
- Never run production commands, live-cluster operations, deployment tooling, migrations, destructive test harnesses, or scripts with unclear side effects merely to validate a review.
- If the user later asks to fix findings, modify only the approved scope. Do not commit, push, or update the PR unless separately requested.

## Establish the target

Accept these review targets:

- **Pull request:** a URL, number, or current branch PR.
- **Current diff:** staged, unstaged, and relevant untracked changes.
- **Branch:** commits and diff from the correct merge base to `HEAD`.
- **File or directory:** the named content plus enough callers, tests, and configuration to evaluate it.
- **Design document or plan:** the document, the implementation it references, and repository constraints needed to verify its claims.

Before reviewing:

1. Read repository instructions and identify language- or directory-specific guidance.
2. Record the target, repository, base, head, and head SHA when available.
3. For a PR, inspect its title, body, base/head branches, commits, changed files, diff, and check status without mutating GitHub.
4. For a current diff, inspect staged and unstaged changes separately and account for relevant untracked files.
5. For a branch, determine the intended base deliberately rather than assuming the default branch, especially for stacked work.
6. State any ambiguity that materially limits the review. Do not silently review the wrong range.

## Review the change in context

Do not review only the visible diff. Read enough surrounding code to understand control flow, invariants, callers, data ownership, and existing tests.

Evaluate:

### Behavior and correctness

- Does the implementation satisfy the stated intent?
- Are state transitions, retries, idempotency, concurrency, ordering, and failure recovery correct?
- Are inputs validated at the right boundary?
- Are errors propagated, classified, and retried appropriately?
- Are cleanup, timeout, cancellation, and terminal-state paths complete?
- Could the change silently succeed while producing the wrong result?

### Safety and security

- Could the change cause data loss, privilege expansion, unsafe defaults, leaked credentials, destructive behavior, or unexpected external effects?
- Are authorization, trust boundaries, path handling, command construction, and secret handling safe?
- Does failure remain bounded and recoverable?
- Are rollback and partial-deployment states safe?

### Tests

- Do tests exercise the behavior rather than merely mirror the implementation?
- Are important negative, boundary, concurrency, retry, timeout, and recovery cases covered?
- Would the tests fail for the defect they claim to prevent?
- Are fixtures and mocks faithful to production contracts?
- Are important integration boundaries left unverified?

A missing test is a confirmed finding only when tied to a concrete regression risk. Otherwise list it as a testing gap or follow-up.

### Compatibility

- Are API, schema, serialization, protocol, CRD, database, configuration, and dependency changes compatible with deployed versions?
- Are migrations, feature flags, default values, generated artifacts, version skew, and downgrade behavior handled?
- Does a rename or deletion leave stale consumers, stored data, or rollout-order hazards?
- For stacked changes, does each layer build and behave against its actual base?

### Operational impact

- What happens under retries, overload, partial outages, stale caches, long-running work, and process restarts?
- Are logging, metrics, events, alerts, and status fields sufficient to diagnose failures?
- Could the change create unbounded work, noisy reconciliation, resource leaks, stuck objects, or missing garbage collection?
- Are rollout, observability, and recovery procedures proportionate to the risk?

### Design documents

- Is the plan internally consistent and implementable in the current repository?
- Do referenced APIs and existing behaviors actually work as claimed?
- Are ownership, sequencing, rollout, migration, observability, testing, and rollback addressed?
- Separate true shipping blockers from optional hardening or future improvements.

Ignore subjective style preferences and minor nits unless they violate repository conventions, materially harm maintainability, or conceal a concrete defect.

## Validate every finding

Before reporting a defect:

1. Trace a concrete execution or data path that reaches it.
2. Check nearby guards, callers, tests, generated code, and configuration for evidence that resolves it.
3. Confirm that the issue is introduced or exposed by the reviewed change, or clearly label it as pre-existing.
4. Identify the user, system, compatibility, or operational impact.
5. Anchor it to the smallest useful current line range.

Do not inflate severity to make a review look substantial. It is acceptable to return no confirmed findings.

## Severity model

- **P0 — Critical:** credible immediate risk of severe data loss, security compromise, broad outage, or irreversible corruption.
- **P1 — High:** likely incorrect behavior, unsafe operation, major compatibility break, or serious production failure requiring resolution before merge.
- **P2 — Medium:** concrete edge-case defect, incomplete failure handling, or meaningful test/operational gap that should normally be resolved.
- **P3 — Low:** limited-impact defect or maintainability problem with a specific future failure mode. Do not use P3 for cosmetic preferences.

Questions and speculative risks are not findings and must not receive a defect severity.

## Report findings first

Begin with confirmed findings, ordered by severity and then by impact. Do not start with praise, process narration, or a summary.

Use this format:

```markdown
## Findings

### [P1] Concise defect title — `path/to/file.go:123`

Explain the concrete failing path, why existing protection is insufficient, and the resulting impact. Include a brief direction for correction without writing a full patch unless requested.
```

Every finding must include:

- one severity;
- a concise outcome-oriented title;
- an exact file and current line or smallest useful line range;
- evidence and triggering conditions;
- concrete impact;
- a proportionate correction direction.

For a design document, use the exact document line or section anchor and cite implementation locations that disprove or constrain the claim.

After confirmed findings, use separate sections as applicable:

```markdown
## Questions and assumptions

- Decisions that require owner clarification.

## Speculative risks and follow-ups

- Plausible concerns that lack enough evidence to classify as defects.

## Testing gaps

- Useful additional validation not tied to a confirmed defect.

## Review coverage

- Target and reviewed range
- Checks run and results
- Areas not reviewed or limitations
```

If there are no confirmed findings, say `No confirmed findings.` and still report residual risks, testing gaps, and review coverage.

## Re-review mode

Use re-review mode when the user says the change was updated, asks for another round, or provides prior reviewer feedback.

1. Recover the previous review's head SHA, findings, questions, and stated limitations from the conversation when available.
2. Determine the new head SHA and inspect the delta since the previous review, not only the full base diff.
3. Verify each prior confirmed finding and classify it as:
   - resolved;
   - still present;
   - partially resolved;
   - no longer applicable.
4. Focus detailed review on changed areas and their affected callers, tests, contracts, and generated output.
5. Perform a bounded regression scan of the complete current diff so a fix in one area does not introduce a new defect elsewhere.
6. Do not repeat resolved findings as current findings.
7. Report new or still-open findings first, followed by a concise prior-finding disposition table.

If the previous head or exact prior diff is unavailable, state that limitation and perform the best grounded comparison possible without pretending it is an exact delta review.

## Fix mode

Enter fix mode only after an explicit request to fix, apply, or address findings.

- Confirm which findings are in scope when the request is ambiguous.
- Preserve unrelated and pre-existing work.
- Make the smallest coherent correction for each approved finding.
- Add or update tests that demonstrate the corrected behavior.
- Re-run relevant checks and re-review the resulting diff.
- Report remaining findings and unresolved risks honestly.
- Do not commit, push, post, or update a PR unless separately requested through the appropriate workflow.
