import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("AI workflows preserve schemas and task metadata independently of prompt wording", () => {
  // Run server-only modules with the same server condition, in an isolated process.
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      fileURLToPath(new URL("../fixtures/check-ai-workflows.ts", import.meta.url)),
    ],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
