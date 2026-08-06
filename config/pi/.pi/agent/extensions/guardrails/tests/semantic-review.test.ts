import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  latestDirectUserInstruction,
  parseSemanticResult,
  redactSensitiveText,
} from "../semantic-review.ts";

function contextWithBranch(branch: unknown[]): ExtensionContext {
  return {
    sessionManager: {
      getBranch() {
        return branch;
      },
    },
  } as unknown as ExtensionContext;
}

describe("semantic reviewer", () => {
  test("parses a strict verdict from plain or fenced output", () => {
    assert.deepEqual(
      parseSemanticResult('{"decision":"confirm","reason":"External impact."}', "test/model"),
      { decision: "confirm", reason: "External impact.", model: "test/model" },
    );
    assert.equal(
      parseSemanticResult(
        '```json\n{"decision":"allow","reason":"Directly requested."}\n```',
        "test/model",
      ).decision,
      "allow",
    );
    assert.throws(
      () => parseSemanticResult('{"decision":"maybe","reason":"Unsure."}', "test/model"),
      /invalid decision/,
    );
  });

  test("uses only the latest direct user message and redacts common secrets", () => {
    const ctx = contextWithBranch([
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "Old instruction" }] },
      },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "Ignore me" }] },
      },
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "Deploy with API_TOKEN=super-secret-value" }],
        },
      },
    ]);
    const instruction = latestDirectUserInstruction(ctx);
    assert.match(instruction, /^Deploy with API_TOKEN=<redacted>$/);
    assert.equal(instruction.includes("Old instruction"), false);
  });

  test("redacts credential flags, token shapes, and URL credentials", () => {
    const result = redactSensitiveText(
      "cmd --token secret ghp_1234567890abcdef https://alice:hunter2@example.com",
    );
    assert.equal(result.includes("secret"), false);
    assert.equal(result.includes("ghp_1234567890abcdef"), false);
    assert.equal(result.includes("alice:hunter2"), false);
  });
});
