"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/features/decision/api";
import type { AiOverview, DecisionView } from "@/domain/decision/schemas";

export type Mutation = (
  endpoint: string,
  method: string,
  body?: Record<string, unknown>,
  label?: string,
) => Promise<DecisionView | null>;
export type Generate = (
  kind: "paths" | "scenarios" | "branch" | "refresh" | "summary",
  scopeId?: string,
  question?: string,
) => Promise<DecisionView | null>;

export function useDecision(id: string) {
  const [record, setRecord] = useState<DecisionView | null>(null);
  const current = useRef<DecisionView | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");

  const accept = useCallback((data: DecisionView) => {
    current.current = data;
    setRecord(data);
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await api<DecisionView>(`/api/decisions/${id}`);
      accept(data);
      setError("");
      setConflict(false);
      return data;
    } catch (cause) {
      setError((cause as Error).message);
      return null;
    }
  }, [id, accept]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Every write reads the revision when its turn starts, not when a button was clicked.
  const mutate = useCallback<Mutation>(
    (endpoint, method, body = {}, label = "正在保存…") => {
      setPending((value) => value + 1);
      const operation = queue.current
        .catch(() => undefined)
        .then(async () => {
          if (!current.current) return null;
          setBusy(label);
          setError("");
          setNotice("");
          try {
            const data = await api<DecisionView>(`/api/decisions/${id}${endpoint}`, {
              method,
              body: JSON.stringify({ ...body, expectedRevision: current.current.revision }),
            });
            accept(data);
            setConflict(false);
            return data;
          } catch (cause) {
            setError((cause as Error).message);
            if (cause instanceof ApiError && cause.status === 409) setConflict(true);
            return null;
          } finally {
            setBusy("");
          }
        })
        .finally(() => setPending((value) => value - 1));
      queue.current = operation;
      return operation;
    },
    [id, accept],
  );

  const generate = useCallback<Generate>(
    (kind, scopeId, question) => {
      const labels = {
        paths: "正在比较不同选择…",
        scenarios: "正在展开可能情境…",
        branch: "正在探索接下来的一步…",
        refresh: "正在更新受影响内容…",
        summary: "正在梳理取舍和行动…",
      };
      return mutate(
        "/generations",
        "POST",
        { kind, scopeId, question, requestKey: crypto.randomUUID() },
        labels[kind],
      );
    },
    [mutate],
  );

  const clarify = useCallback((): Promise<AiOverview | null> => {
    setPending((value) => value + 1);
    const operation = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (!current.current) return null;
        setBusy("正在整理你的想法…");
        setError("");
        setNotice("");
        try {
          return await api<AiOverview>(`/api/decisions/${id}/clarify`, {
            method: "POST",
            body: JSON.stringify({ expectedRevision: current.current.revision }),
          });
        } catch (cause) {
          setError((cause as Error).message);
          return null;
        } finally {
          setBusy("");
        }
      })
      .finally(() => setPending((value) => value - 1));
    queue.current = operation;
    return operation;
  }, [id]);

  return {
    record,
    busy,
    pending: pending > 0,
    error,
    conflict,
    notice,
    setNotice,
    setError,
    mutate,
    generate,
    clarify,
    reload,
  };
}
