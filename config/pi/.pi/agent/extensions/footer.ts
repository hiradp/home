/**
 * Custom Footer - a pi port of the Claude statusline (lib/claude/statusline.sh).
 *
 * Layout: folder@branch ↑a ↓b (+x -y) | model · thinking | [bar] pct% / size | quotas | $cost
 *
 * - folder/branch, ahead/behind and working-tree diffstats come from git
 *   (spawned at most once per CACHE_TTL_MS; branch changes refresh immediately)
 * - worktrees display as "project⎇worktree" like the Claude version
 * - the context bar mirrors the statusline: 80% real -> 100% displayed, 10 cells
 * - session cost is summed from assistant message usage (same as the default footer)
 * - subscription quota chips are fetched for Anthropic and OpenAI Codex OAuth;
 *   providers without a supported usage API (including Cursor) are omitted
 *
 * Not portable from the Claude statusline: the identity chip (pi runs a single identity).
 */

import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const CACHE_TTL_MS = 2000;

interface GitInfo {
  /** Display name for the folder part, e.g. "home" or "home⎇feat-x" */
  dir: string;
  ahead: number;
  behind: number;
  added: number;
  deleted: number;
}

interface QuotaWindow {
  label: string;
  usedPercent: number;
}

interface ProviderQuota {
  provider: string;
  windows: QuotaWindow[];
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function windowLabel(seconds: number): string {
  if (seconds <= 6 * 60 * 60) return "5h";
  if (seconds <= 36 * 60 * 60) return "day";
  if (seconds <= 8 * 24 * 60 * 60) return "wk";
  return `${Math.round(seconds / (24 * 60 * 60))}d`;
}

function codexAccountId(token: string): string | null {
  try {
    const payload = asRecord(
      JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")),
    );
    const auth = asRecord(payload?.["https://api.openai.com/auth"]);
    return typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : null;
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error(`Quota request failed: ${response.status}`);
  return response.json();
}

async function loadProviderQuota(
  ctx: ExtensionContext,
  provider: string,
  signal: AbortSignal,
): Promise<ProviderQuota | null> {
  const model = ctx.model;
  if (!model || model.provider !== provider) return null;

  const auth = await ctx.modelRegistry.getProviderAuth(provider);
  const token = auth?.auth.apiKey;
  if (!token || auth.source?.toLowerCase() !== "oauth") return null;

  if (provider === "anthropic") {
    const data = asRecord(
      await fetchJson(
        "https://api.anthropic.com/api/oauth/usage",
        { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
        signal,
      ),
    );
    const windows: QuotaWindow[] = [];
    const fiveHour = asPercent(asRecord(data?.five_hour)?.utilization);
    const sevenDay = asPercent(asRecord(data?.seven_day)?.utilization);
    if (fiveHour !== null) windows.push({ label: "5h", usedPercent: fiveHour });
    if (sevenDay !== null) windows.push({ label: "wk", usedPercent: sevenDay });
    return windows.length > 0 ? { provider, windows } : null;
  }

  if (provider === "openai-codex") {
    const accountId = codexAccountId(token);
    if (!accountId) return null;
    const data = asRecord(
      await fetchJson(
        "https://chatgpt.com/backend-api/wham/usage",
        { authorization: `Bearer ${token}`, "chatgpt-account-id": accountId },
        signal,
      ),
    );
    const rateLimit = asRecord(data?.rate_limit);
    const windows: Array<QuotaWindow & { seconds: number }> = [];
    for (const key of ["primary_window", "secondary_window"]) {
      const window = asRecord(rateLimit?.[key]);
      const usedPercent = asPercent(window?.used_percent);
      const seconds = window?.limit_window_seconds;
      if (usedPercent !== null && typeof seconds === "number" && seconds > 0) {
        windows.push({ label: windowLabel(seconds), usedPercent, seconds });
      }
    }
    windows.sort((a, b) => a.seconds - b.seconds);
    return windows.length > 0
      ? { provider, windows: windows.map(({ label, usedPercent }) => ({ label, usedPercent })) }
      : null;
  }

  return null;
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
  let requestQuotaRefresh: (() => void) | undefined;

  pi.on("model_select", () => requestQuotaRefresh?.());
  pi.on("agent_settled", () => requestQuotaRefresh?.());

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      let quota: ProviderQuota | null = null;
      let quotaRequest = 0;
      let disposed = false;
      const quotaAbort = new AbortController();
      const unsubscribe = footerData.onBranchChange(() => {
        invalidateGitCache();
        tui.requestRender();
      });

      const refreshQuota = () => {
        const provider = ctx.model?.provider;
        const request = ++quotaRequest;
        if (!provider) {
          quota = null;
          tui.requestRender();
          return;
        }
        if (quota?.provider !== provider) quota = null;
        void loadProviderQuota(ctx, provider, quotaAbort.signal)
          .then((next) => {
            if (request === quotaRequest && ctx.model?.provider === provider) quota = next;
          })
          .catch(() => {
            if (request === quotaRequest && ctx.model?.provider === provider) quota = null;
          })
          .finally(() => {
            if (!disposed) tui.requestRender();
          });
      };
      requestQuotaRefresh = refreshQuota;
      const quotaTimer = setInterval(refreshQuota, 5 * 60 * 1000);
      refreshQuota();

      return {
        dispose() {
          disposed = true;
          unsubscribe();
          clearInterval(quotaTimer);
          quotaAbort.abort();
          if (requestQuotaRefresh === refreshQuota) requestQuotaRefresh = undefined;
        },
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
              level === "off" ? theme.fg("dim", "off") : theme.getThinkingBorderColor(level)(level);
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

          // ===== Provider subscription quotas =====
          const activeQuota = quota;
          if (activeQuota && activeQuota.provider === ctx.model?.provider) {
            const quotaPart = activeQuota.windows
              .map(({ label, usedPercent }) => {
                const color: "dim" | "warning" | "error" =
                  usedPercent >= 95 ? "error" : usedPercent >= 70 ? "warning" : "dim";
                return (
                  theme.fg("dim", `${label} `) + theme.fg(color, `${Math.round(usedPercent)}%`)
                );
              })
              .join(theme.fg("dim", " · "));
            parts.push(quotaPart);
          }

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
