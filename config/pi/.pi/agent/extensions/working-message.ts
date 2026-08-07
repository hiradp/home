/**
 * Working Message - shows a random phrase and elapsed time in Pi's working row.
 *
 * One phrase is selected per request and remains stable while the whole-second
 * timer runs from before_agent_start until agent_settled.
 */

import { performance } from "node:perf_hooks";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WORKING_PHRASES = [
  "Appeasing the linter",
  "Bribing the compiler",
  "Consulting the forbidden docs",
  "Cooking forbidden spaghetti",
  "Disturbing the void",
  "Doing suspiciously legal things",
  "Gaslighting the type checker",
  "Herding cursed semicolons",
  "Making it weird",
  "Negotiating with entropy",
  "Overthinking professionally",
  "Poking the machine spirit",
  "Polishing the haunted cache",
  "Questioning my life choices",
  "Rearranging the bits",
  "Reticulating splines",
  "Shaking the dependency tree",
  "Stealing fire from the cloud",
  "Summoning tiny demons",
  "Turning coffee into tokens",
  "Untangling eldritch noodles",
  "Violating causality",
  "Waking the ancient APIs",
] as const;

function randomWorkingPhrase(): string {
  return WORKING_PHRASES[Math.floor(Math.random() * WORKING_PHRASES.length)] ?? "Working";
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${seconds.toString().padStart(2, "0")}s`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export default function (pi: ExtensionAPI) {
  let requestStartedAt: number | null = null;
  let workingPhrase: string | null = null;
  let workingTimer: ReturnType<typeof setInterval> | undefined;

  const stopWorkingTimer = () => {
    if (workingTimer !== undefined) clearInterval(workingTimer);
    workingTimer = undefined;
    requestStartedAt = null;
    workingPhrase = null;
  };

  pi.on("before_agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (requestStartedAt === null) {
      requestStartedAt = performance.now();
      workingPhrase = randomWorkingPhrase();
    }

    const updateWorkingMessage = () => {
      if (requestStartedAt === null || workingPhrase === null) return;
      ctx.ui.setWorkingMessage(
        `${workingPhrase}... ${formatDuration(performance.now() - requestStartedAt)}`,
      );
    };

    updateWorkingMessage();
    if (workingTimer === undefined) workingTimer = setInterval(updateWorkingMessage, 1000);
  });

  pi.on("agent_settled", (_event, ctx) => {
    stopWorkingTimer();
    if (ctx.mode === "tui") ctx.ui.setWorkingMessage();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopWorkingTimer();
    if (ctx.mode === "tui") ctx.ui.setWorkingMessage();
  });
}
