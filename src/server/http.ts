import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let allowed = false;
  try {
    const parsed = new URL(origin || "");
    allowed =
      ["http:", "https:"].includes(parsed.protocol) && parsed.host === request.headers.get("host");
  } catch {
    /* Missing or malformed origin is rejected. */
  }
  if (!allowed) throw new HttpError(403, "请求来源不匹配，请刷新页面重试。");
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 24000)
    throw new HttpError(413, "输入内容过长。");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "请求内容为空。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) {
      await reader.cancel();
      throw new HttpError(413, "输入内容过长。");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "请求格式不正确。");
  }
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return Response.json({ error: error.issues[0]?.message || "输入不正确" }, { status: 400 });
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    { error: "服务暂时不可用，请检查数据库连接后重试。你的编辑内容仍保留在当前页面。" },
    { status: 503 },
  );
}
