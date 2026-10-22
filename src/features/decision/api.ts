export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("服务暂时没有返回完整结果，请保留当前内容后重试。", response.status);
  }
  if (!response.ok)
    throw new ApiError(
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || "请求失败，请稍后重试。",
      response.status,
    );
  return payload.data as T;
}
