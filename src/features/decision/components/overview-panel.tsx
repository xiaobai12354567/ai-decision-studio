"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Save, Sparkles } from "lucide-react";
import type { AiOverview, DecisionView } from "@/domain/decision/schemas";
import type { Mutation } from "@/features/decision/hooks/use-decision";

const fields = [
  { kind: "goal", label: "希望获得的改变", placeholder: "例如：更有成长空间，也想留出生活的时间" },
  { kind: "options", label: "已经考虑的选项", placeholder: "例如：留下、换工作，或先试一段时间" },
  { kind: "budget", label: "时间与预算", placeholder: "可用积蓄、每月支出、打算什么时候做决定" },
  { kind: "family", label: "家庭与现实约束", placeholder: "哪些安排是必须尊重的？" },
  { kind: "concern", label: "最担心的事情", placeholder: "什么代价让你迟迟无法行动？" },
];
type Draft = { title: string; values: Record<string, string> };
const fromRecord = (record: DecisionView): Draft => ({
  title: record.title,
  values: Object.fromEntries(
    record.conditions.map((condition) => [condition.kind, condition.value]),
  ),
});
const signature = (draft: Draft) =>
  JSON.stringify([draft.title, fields.map((field) => draft.values[field.kind] || "")]);

export function OverviewPanel({
  record,
  pending,
  mutate,
  clarify,
  onDirty,
  onNotice,
}: {
  record: DecisionView;
  pending: boolean;
  mutate: Mutation;
  clarify: () => Promise<AiOverview | null>;
  onDirty: (dirty: boolean) => void;
  onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromRecord(record));
  const [saved, setSaved] = useState(() => signature(fromRecord(record)));
  const [questions, setQuestions] = useState<string[]>([]);
  const [recovered, setRecovered] = useState(false);
  const [ready, setReady] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveRef = useRef<Promise<DecisionView | null> | null>(null);
  const dirty = signature(draft) !== saved;
  const storageKey = `nextstep:overview:${record.id}`;

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const candidate = JSON.parse(stored) as Draft;
        if (
          typeof candidate.title === "string" &&
          candidate.values &&
          typeof candidate.values === "object" &&
          !Array.isArray(candidate.values) &&
          Object.values(candidate.values).every((value) => typeof value === "string")
        ) {
          setDraft(candidate);
          setRecovered(signature(candidate) !== signature(fromRecord(record)));
        }
      }
    } catch {
      /* The editor remains usable if browser storage is unavailable. */
    }
    setReady(true);
    // Only initialize once; server refreshes must never replace an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    onDirty(dirty);
    if (!ready) return;
    try {
      if (dirty) sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* best effort backup */
    }
  }, [draft, dirty, ready, storageKey, onDirty]);

  useEffect(() => {
    if (!dirty && ready) {
      const latest = fromRecord(record);
      if (signature(latest) !== saved) {
        setDraft(latest);
        setSaved(signature(latest));
      }
    }
  }, [record, dirty, ready, saved]);

  const save = useCallback(
    async (confirm = false) => {
      if (saveRef.current) await saveRef.current;
      const snapshot = draftRef.current;
      if (!snapshot.title.trim()) return null;
      const operation = mutate("/overview", "PUT", {
        title: snapshot.title,
        confirm: confirm || (!!record.confirmedAt && !requiresConfirmation),
        conditions: fields.map((field) => ({
          kind: field.kind,
          label: field.label,
          value: snapshot.values[field.kind] || "",
        })),
      });
      saveRef.current = operation;
      const result = await operation;
      saveRef.current = null;
      if (result) {
        setSaved(signature(snapshot));
        setRecovered(false);
        if (confirm) setRequiresConfirmation(false);
        if (confirm) onNotice("概况已确认。接下来，可以比较几条不同的选择路径。");
      }
      return result;
    },
    [mutate, record.confirmedAt, requiresConfirmation, onNotice],
  );

  useEffect(() => {
    if (!ready || !dirty || organizing || recovered || !draft.title.trim()) return;
    const timer = window.setTimeout(() => {
      void save();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, ready, organizing, recovered, save]);

  async function organize() {
    setOrganizing(true);
    try {
      if (dirty && !(await save())) return;
      const result = await clarify();
      if (!result) return;
      setRequiresConfirmation(true);
      setDraft((previous) => {
        const values = { ...previous.values };
        for (const condition of result.conditions)
          if (!values[condition.kind]?.trim()) values[condition.kind] = condition.value;
        return { ...previous, values };
      });
      setQuestions(result.questions);
      onNotice("AI 建议已填入空白项。请检查事实与假设，确认后再用于推演。");
    } finally {
      setOrganizing(false);
    }
  }

  return (
    <details className="paper overview overview-disclosure" open={!record.confirmedAt || undefined}>
      <summary>
        <div>
          <span className="section-index">01</span>
          <h2>你的决策概况</h2>
        </div>
        <span className="muted">
          {dirty ? "修改会自动保存" : record.confirmedAt ? "已确认 · 点击编辑" : "先确认你站在哪里"}
        </span>
      </summary>
      <div className="disclosure-body">
        <div className="section-heading">
          <p className="muted">把事实和在意的事写清楚。不确定的地方可以留空。</p>
          <button
            className="button secondary"
            type="button"
            disabled={pending || organizing}
            onClick={organize}
          >
            <Sparkles size={16} />
            {organizing ? "正在整理…" : "AI 帮我整理"}
          </button>
        </div>
        {recovered && (
          <p className="notice" role="status">
            已恢复这个标签页中未保存的概况。请先核对最新条件，再点击保存；恢复的草稿不会自动覆盖数据库。
          </p>
        )}
        {questions.length > 0 && (
          <div className="questions">
            <strong>还有几件值得想一想的事</strong>
            <ul>
              {questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            <small>可以把答案补充到下方，也可以暂时留白。</small>
          </div>
        )}
        <fieldset disabled={organizing}>
          <label htmlFor="decision-title">给这份决策起个名字</label>
          <input
            id="decision-title"
            value={draft.title}
            maxLength={100}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, title: event.target.value }))
            }
          />
          {fields.map((field) => (
            <div className="field" key={field.kind}>
              <label htmlFor={`condition-${field.kind}`}>{field.label}</label>
              <textarea
                id={`condition-${field.kind}`}
                rows={2}
                maxLength={1000}
                value={draft.values[field.kind] || ""}
                placeholder={field.placeholder}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    values: { ...previous.values, [field.kind]: event.target.value },
                  }))
                }
              />
            </div>
          ))}
        </fieldset>
        <div className="form-bottom">
          <span className="muted" role="status">
            {dirty ? "尚有未保存修改；失败时内容会留在这里。" : "概况已保存"}
          </span>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={pending || !draft.title.trim()}
              onClick={() => void save()}
            >
              <Save size={16} />
              保存
            </button>
            <button
              className="button primary"
              disabled={pending || !draft.title.trim()}
              onClick={() => void save(true)}
            >
              <Check size={17} />
              {record.confirmedAt ? "确认修改" : "确认这份概况"}
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
