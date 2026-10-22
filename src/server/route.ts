import { session } from "./session";
import { body, checkOrigin, failure, HttpError } from "./http";
import type { z } from "zod";

export async function writeRoute<T>(
  request: Request,
  schema: z.ZodType<T>,
  work: (owner: string, input: T) => Promise<unknown>,
) {
  try {
    checkOrigin(request);
    const owner = await session();
    if (!owner) throw new HttpError(401, "浏览器会话已失效，请返回列表重新打开。");
    const input = schema.parse(await body(request));
    return Response.json({ data: await work(owner.id, input) });
  } catch (error) {
    return failure(error);
  }
}
