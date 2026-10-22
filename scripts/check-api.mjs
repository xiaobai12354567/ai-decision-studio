// Run against a local dev server; creates and cleans up its own database session.
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
let cookie;
async function request(path, method = "GET", body, authenticated = true, revisionOrigin = base) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: revisionOrigin,
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
try {
  let response = await request("/api/decisions", "POST", {
    description: "我想去上海工作，但担心生活成本和离家太远。",
  });
  assert.equal(response.status, 201);
  cookie = response.headers.get("set-cookie").split(";")[0];
  const original = (await response.json()).data;
  response = await request(`/api/decisions/${original.id}`, "GET", undefined, false);
  assert.equal(response.status, 404, "Another session must not read the decision");
  const update = {
    expectedRevision: 0,
    title: "去上海，还是留在当前城市？",
    confirm: true,
    conditions: [{ kind: "budget", label: "时间与预算", value: "积蓄 8 万元" }],
  };
  response = await request(`/api/decisions/${original.id}/overview`, "PUT", update);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.revision, 1);
  response = await request(`/api/decisions/${original.id}/overview`, "PUT", update);
  assert.equal(response.status, 409, "Stale version must be rejected");
  response = await request(`/api/decisions/${original.id}`);
  const saved = (await response.json()).data;
  assert.equal(saved.conditions[0].value, "积蓄 8 万元");
  assert.equal(saved.stage, "exploring");
  response = await request(
    `/api/decisions/${original.id}/overview`,
    "PUT",
    { ...update, expectedRevision: 1 },
    true,
    "https://untrusted.example",
  );
  assert.equal(response.status, 403, "Cross-origin mutation must be rejected");
  response = await request("/api/decisions", "POST", { description: "短" });
  assert.equal(response.status, 400);
  console.log(
    "PASS: create, confirm, reload, Unicode persistence, session isolation, stale-write rejection, Origin check, input validation.",
  );
} finally {
  if (cookie) {
    const token = cookie.slice(cookie.indexOf("=") + 1);
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('DELETE FROM "VisitorSession" WHERE "tokenHash" = $1', [
      createHash("sha256").update(token).digest("hex"),
    ]);
    await client.end();
    console.log("Test-owned session and data cleaned up.");
  }
}
