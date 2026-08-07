---
name: deslop
description: Remove AI-generated slop from code changes. Use when the user says "deslop", "remove slop", "clean up AI comments", or wants to strip unnecessary AI-added comments from a branch's diff. Works with any language, optimized for Go and Zig codebases.
---

# Deslop

Check the diff against main and remove all AI-generated comment slop introduced in this branch.

## What to remove

### Decorative section headers (top priority)

LLMs compulsively insert "section divider" comments to organize code into labeled regions. These are the single biggest tell of AI-generated code. Remove them aggressively. They add no information — the code structure *is* the organization.

Patterns to match (any comment syntax: `//`, `#`, `/* */`, `--`, etc.):
- Dashed/decorated dividers: `// --- Tests ---`, `// === Helpers ===`, `# ---- Config ----`
- Section labels: `// Tests`, `// Helpers`, `// Public API`, `// Private methods`
- Re-export / sub-module labels: `// --- Re-exports: foo.zig ---`, `// --- Sub-modules ---`
- Category headers: `// Write helpers`, `// Utility functions`, `// Constants`, `// Type definitions`
- Any comment that is just a noun or noun phrase acting as a heading for a block of code

If the *pre-existing* code already uses section headers in this style, leave them alone — only strip ones introduced in this branch's diff.

### Other comment slop

- Comments that explain obvious code (`// initialize the variable`, `// return the result`)
- Redundant comments that restate the function/variable name (`// processItems processes items`)
- Comments that narrate control flow (`// check if error`, `// loop through items`)
- TODO/FIXME comments added by AI that weren't requested
- Doc comments on unexported or obvious functions that don't need them
- Any comment style inconsistent with the rest of the file

## What to keep

- Comments explaining *why*, not *what*
- Comments matching the existing style and density of the file
- License headers
- Compiler directives and build tags
- Comments the user wrote (present before this branch)

## Process

1. Get the diff: `git diff main`
2. For each changed file, read the full file to understand existing comment style and density
3. Remove slop comments from the branch's changes only — do not touch pre-existing code
4. Report a 1-3 sentence summary of what was changed
