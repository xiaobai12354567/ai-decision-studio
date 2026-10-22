import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

export async function session(create = false) {
  const jar = await cookies();
  const token = jar.get("decision-session")?.value;
  if (token) {
    const existing = await db().visitorSession.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    });
    if (existing && existing.expiresAt > new Date()) {
      // Renew at most once per day, and only when accessed in a route handler.
      if (existing.expiresAt.getTime() - Date.now() < 89 * 86400000) {
        const expiresAt = new Date(Date.now() + 90 * 86400000);
        await db().visitorSession.update({ where: { id: existing.id }, data: { expiresAt } });
        jar.set("decision-session", token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          expires: expiresAt,
        });
        return { ...existing, expiresAt };
      }
      return existing;
    }
  }
  if (!create) return null;
  const fresh = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 90 * 86400000);
  const record = await db().visitorSession.create({
    data: { tokenHash: createHash("sha256").update(fresh).digest("hex"), expiresAt },
  });
  jar.set("decision-session", fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return record;
}
