/**
 * Custom Footer - a pi port of the Claude statusline (lib/claude/statusline.sh).
 *
 * Layout: folder@branch ↑a ↓b (+x -y) | model · thinking | [bar] pct% / size | $cost
 *
 * - folder/branch, ahead/behind and working-tree diffstats come from git
 *   (spawned at most once per CACHE_TTL_MS; branch changes refresh immediately)
 * - worktrees display as "project⎇worktree" like the Claude version
 * - the context bar mirrors the statusline: 80% real -> 100% displayed, 10 cells
 * - session cost is summed from assistant message usage (same as the default footer)
 *
 * Not portable from the Claude statusline: rate-limit chips (pi exposes no
 * provider quota data) and the identity chip (pi runs a single identity).
 */

import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const CACHE_TTL_MS = 2000;

interface GitInfo {
	/** Display name for the folder part, e.g. "home" or "home⎇feat-x" */
	dir: string;
	ahead: number;
	behind: number;
	added: number;
	deleted: number;
}

let cache: { cwd: string; at: number; info: GitInfo | null } | null = null;

function runGit(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", ["-C", cwd, "--no-optional-locks", ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 3000,
		}).trim();
	} catch {
		return null;
	}
}

function loadGitInfo(cwd: string): GitInfo | null {
	const now = Date.now();
	if (cache && cache.cwd === cwd && now - cache.at < CACHE_TTL_MS) {
		return cache.info;
	}

	let info: GitInfo | null = null;
	const toplevel = runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (toplevel) {
		// Worktree detection: main worktree root is the parent of the common git dir.
		let dir = basename(toplevel);
		const commonDir = runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
		if (commonDir) {
			const mainRoot = dirname(commonDir);
			if (mainRoot !== toplevel) {
				dir = `${basename(mainRoot)}⎇${basename(toplevel)}`;
			}
		}

		let ahead = 0;
		let behind = 0;
		const ab = runGit(cwd, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]);
		if (ab) {
			const [b, a] = ab.split(/\s+/).map(Number);
			behind = b || 0;
			ahead = a || 0;
		}

		let added = 0;
		let deleted = 0;
		const numstat = runGit(cwd, ["diff", "--numstat"]);
		if (numstat) {
			for (const line of numstat.split("\n")) {
				const [a, d] = line.split("\t");
				added += Number(a) || 0;
				deleted += Number(d) || 0;
			}
		}

		info = { dir, ahead, behind, added, deleted };
	}

	cache = { cwd, at: now, info };
	return info;
}

function invalidateGitCache(): void {
	cache = null;
}

/** Session cost in dollars, summed over assistant messages (mirrors the default footer). */
function sessionCost(ctx: ExtensionContext): number {
	let cost = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			cost += entry.message.usage?.cost?.total ?? 0;
		} else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
			cost += entry.usage.cost?.total ?? 0;
		}
	}
	return cost;
}

function formatWindow(size: number): string {
	if (size >= 1_000_000) return `${Math.round(size / 1_000_000)}M`;
	if (size >= 1_000) return `${Math.round(size / 1_000)}k`;
	return `${size}`;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => {
				invalidateGitCache();
				tui.requestRender();
			});

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const sep = theme.fg("dim", " | ");
					const parts: string[] = [];

					// ===== Folder + git =====
					const branch = footerData.getGitBranch();
					const git = loadGitInfo(ctx.cwd);
					if (git) {
						let folder = git.dir;
						if (branch) {
							folder += theme.fg("dim", "@") + theme.fg("mdLink", branch);
							const ab: string[] = [];
							if (git.ahead > 0) ab.push(theme.fg("success", `↑${git.ahead}`));
							if (git.behind > 0) ab.push(theme.fg("warning", `↓${git.behind}`));
							if (ab.length > 0) folder += ` ${ab.join("")}`;
							if (git.added + git.deleted > 0) {
								folder +=
									theme.fg("dim", " (") +
									theme.fg("toolDiffAdded", `+${git.added}`) +
									theme.fg("dim", " ") +
									theme.fg("toolDiffRemoved", `-${git.deleted}`) +
									theme.fg("dim", ")");
							}
						}
						parts.push(folder);
					} else {
						parts.push(basename(ctx.cwd));
					}

					// ===== Model + thinking level =====
					const modelId = ctx.model?.id ?? "no-model";
					let modelPart =
						footerData.getAvailableProviderCount() > 1 && ctx.model
							? theme.fg("dim", `(${ctx.model.provider}) `) + modelId
							: modelId;
					if (ctx.model?.reasoning && ctx.thinkingLevel) {
						const level = ctx.thinkingLevel;
						const colored =
							level === "off"
								? theme.fg("dim", "off")
								: theme.getThinkingBorderColor(level)(level);
						modelPart += theme.fg("dim", " · ") + colored;
					}
					parts.push(modelPart);

					// ===== Context bar (80% real -> 100% displayed, like the statusline) =====
					const usage = ctx.getContextUsage();
					const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const pctReal = usage?.percent ?? 0;
					const pct = Math.min(100, Math.round((pctReal * 100) / 80));
					const filled = Math.min(10, Math.floor((pct * 10) / 100));
					const barColor = pct >= 80 ? "error" : pct >= 50 ? "warning" : "success";
					const bar =
						theme.fg(barColor, "█".repeat(filled) + "░".repeat(10 - filled)) +
						theme.fg(barColor, ` ${pct}%`) +
						theme.fg("dim", ` / ${formatWindow(window)}`);
					parts.push(bar);

					// ===== Session cost =====
					const cost = sessionCost(ctx);
					if (cost > 0) {
						parts.push(theme.fg("dim", `$${cost.toFixed(3)}`));
					}

					return [truncateToWidth(parts.join(sep), width, theme.fg("dim", "..."))];
				},
			};
		});
	});
}
