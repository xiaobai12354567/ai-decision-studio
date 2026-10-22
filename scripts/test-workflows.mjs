import { spawn } from "node:child_process";
import { once } from "node:events";

// Own every process and stop it in finally. Fixture credentials override real credentials
// only in the isolated test app's child environment; no .env files are changed.
const children = [];
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));
  children.push(child);
  return child;
}
async function ready(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* wait for child to start */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test child did not start");
}
async function run(args, env) {
  const child = start(args, env);
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`Test failed with exit code ${code}`);
}
try {
  for (const port of [3001, 4010]) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      throw new Error(`Port ${port} is already in use; stop the previous test service first.`);
    } catch (error) {
      if (error.message.startsWith("Port ")) throw error;
    }
  }
  start(["tests/fixtures/model-server.mjs"]);
  await ready("http://127.0.0.1:4010/stats");
  start(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"], {
    DEEPSEEK_API_KEY: "integration-fixture-only",
    DEEPSEEK_BASE_URL: "http://127.0.0.1:4010",
  });
  await ready("http://127.0.0.1:3001/api/status");
  const env = { TEST_BASE_URL: "http://127.0.0.1:3001", TEST_FIXTURE_AI: "1" };
  await run(["scripts/check-api.mjs"], env);
  await run(["scripts/check-workflows.mjs"], env);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
}
