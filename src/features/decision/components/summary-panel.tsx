"use client";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, Save, Sparkles } from "lucide-react";
import type { ActionView, DecisionView } from "@/domain/decision/schemas";
import type { Generate, Mutation } from "../hooks/use-decision";
import { BulletList, LinesField, splitLines, StaleNote } from "./shared";

function ResultForm({
  action,
  pending,
  mutate,
}: {
  action: ActionView;
  pending: boolean;
  mutate: Mutation;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="result-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await mutate(`/actions/${action.id}/results`, "POST", { text }, "正在保存行动结果…"))
          setText("");
      }}
    >
      <label htmlFor={`result-${action.id}`}>做完这一步，你发现了什么？</label>
      <textarea
        id={`result-${action.id}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        maxLength={4000}
        minLength={3}
        required
        placeholder="记录实际结果，哪些担忧被验证了，哪些想法发生了变化……"
      />
      <div className="form-bottom">
        <small>先保存结果，再让 AI 结合新信息更新总结。</small>
        <button className="button primary" disabled={pending || text.trim().length < 3}>
          <Check size={16} />
          保存行动结果
        </button>
      </div>
    </form>
  );
}
function SummaryEditor({
  record,
  pending,
  mutate,
  onDirty,
}: {
  record: DecisionView;
  pending: boolean;
  mutate: Mutation;
  onDirty: (dirty: boolean) => void;
}) {
  const summary = record.summary!;
  const [inclination, setInclination] = useState(summary.inclinationPathId || "");
  const [reason, setReason] = useState(summary.reason);
  const [benefits, setBenefits] = useState(summary.valuedBenefits.join("\n"));
  const [costs, setCosts] = useState(summary.unacceptableCosts.join("\n"));
  const [unknowns, setUnknowns] = useState(summary.unknowns.join("\n"));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  return (
    <form
      className="summary-editor paper"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await mutate("/summary", "PATCH", {
          inclinationPathId: inclination || null,
          reason,
          valuedBenefits: splitLines(benefits),
          unacceptableCosts: splitLines(costs),
          unknowns: splitLines(unknowns),
        });
        if (result) setDirty(false);
      }}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 · 我现在的判断</p>
          <h2>看清取舍，允许暂时没有答案。</h2>
        </div>
        <span className="badge">可编辑</span>
      </div>
      {summary.freshness === "stale" && <StaleNote reason={summary.staleReason} />}
      <fieldset disabled={pending}>
        <label htmlFor="inclination">当前更倾向哪一条路径？</label>
        <select
          id="inclination"
          value={inclination}
          onChange={(event) => {
            setInclination(event.target.value);
            setDirty(true);
          }}
        >
          <option value="">暂不选择，先验证更多信息</option>
          {record.paths.map((path) => (
            <option value={path.id} key={path.id}>
              {path.title}
            </option>
          ))}
        </select>
        <div className="field">
          <label htmlFor="inclination-reason">为什么？</label>
          <textarea
            id="inclination-reason"
            rows={4}
            maxLength={2000}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="editor-grid">
          <LinesField
            id="valued-benefits"
            label="我看重的收益"
            value={benefits}
            onChange={(value) => {
              setBenefits(value);
              setDirty(true);
            }}
          />
          <LinesField
            id="unacceptable-costs"
            label="不可接受的代价"
            value={costs}
            onChange={(value) => {
              setCosts(value);
              setDirty(true);
            }}
          />
        </div>
        <LinesField
          id="unknowns"
          label="尚未确认的关键信息"
          value={unknowns}
          onChange={(value) => {
            setUnknowns(value);
            setDirty(true);
          }}
        />
      </fieldset>
      <div className="form-bottom">
        <small>{dirty ? "有未保存的总结修改" : "这是你自己的总结，可以随时调整。"}</small>
        <button className="button secondary" disabled={pending || !dirty}>
          <Save size={16} />
          保存我的修改
        </button>
      </div>
    </form>
  );
}
export function SummaryPanel({
  record,
  pending,
  generate,
  mutate,
  onDirty,
}: {
  record: DecisionView;
  pending: boolean;
  generate: Generate;
  mutate: Mutation;
  onDirty: (dirty: boolean) => void;
}) {
  const summary = record.summary;
  const hasStale = record.paths.some(
    (path) => path.freshness === "stale" || path.scenarios.some((s) => s.freshness === "stale"),
  );
  const [editorVersion, setEditorVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  async function summarize() {
    if (await generate("summary")) {
      setDirty(false);
      setEditorVersion((value) => value + 1);
    }
  }
  if (!summary)
    return (
      <div className="empty summary-empty">
        <h2>把探索过的可能，变成可以做的事。</h2>
        <p>AI 会结合条件和反馈，整理关键取舍、待确认信息与一到三个行动。</p>
        <button
          className="button primary"
          disabled={pending || !record.paths.length || hasStale}
          onClick={summarize}
        >
          <Sparkles size={17} />
          生成决策总结
        </button>
        {!record.paths.length && <p className="muted">先回工作台探索至少一条路径。</p>}
        {hasStale && <p className="muted">条件发生了变化，请先回工作台更新受影响内容。</p>}
      </div>
    );
  const selected = summary.actions.find((action) => action.status === "selected");
  const candidates = summary.actions
    .filter((action) => ["candidate", "selected"].includes(action.status))
    .sort((a, b) => Number(b.status === "selected") - Number(a.status === "selected"));
  return (
    <div className="summary-layout">
      <div className="summary-primary">
        <SummaryEditor
          key={`${summary.id}-${editorVersion}`}
          record={record}
          pending={pending}
          mutate={mutate}
          onDirty={setDirty}
        />
        <section className="action-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 · 迈出可验证的一步</p>
              <h2>接下来，我可以做什么？</h2>
            </div>
            <span className="muted">选择一个就好</span>
          </div>
          {summary.freshness === "stale" && (
            <p className="stale-note">
              总结需要更新后，才能选定新的行动。已选行动仍可记录实际结果。
            </p>
          )}
          <div className="action-list">
            {candidates.map((action, index) => (
              <article
                className={`action-card ${action.status === "selected" ? "selected" : ""}`}
                key={action.id}
              >
                <div className="action-number">
                  {action.status === "selected" ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </div>
                <div className="action-content">
                  <h3>{action.task}</h3>
                  <dl>
                    <dt>要验证什么</dt>
                    <dd>{action.verification}</dd>
                    <dt>如何帮助判断</dt>
                    <dd>{action.decisionHelp}</dd>
                  </dl>
                  {action.status === "selected" ? (
                    <span className="badge">这是我当前的下一步</span>
                  ) : (
                    <button
                      className="button secondary"
                      disabled={pending || dirty || summary.freshness === "stale"}
                      onClick={() =>
                        void mutate(`/actions/${action.id}/select`, "POST", {}, "正在选定下一步…")
                      }
                    >
                      <Check size={16} />
                      把它作为下一步
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {selected && (
            <div className="paper selected-action-result">
              <h3>完成后，再回来看看。</h3>
              <p className="muted">你的下一步：{selected.task}</p>
              <ResultForm action={selected} pending={pending || dirty} mutate={mutate} />
            </div>
          )}
        </section>
        {record.actionHistory.filter((action) => action.status === "completed").length > 0 && (
          <section className="action-history">
            <p className="eyebrow">03 · 已经走过的路</p>
            <h2>每次行动，都带来新的依据。</h2>
            {record.actionHistory
              .filter((action) => action.status === "completed")
              .map((action) => (
                <article className="paper completed-action" key={action.id}>
                  <span className="badge">
                    <CheckCircle2 size={13} />
                    已记录结果
                  </span>
                  <h3>{action.task}</h3>
                  <BulletList items={action.results.map((result) => result.text)} />
                  <details>
                    <summary>补充这个行动的结果</summary>
                    <ResultForm action={action} pending={pending || dirty} mutate={mutate} />
                  </details>
                </article>
              ))}
          </section>
        )}
      </div>
      <aside className="summary-sidebar paper">
        <p className="eyebrow">给此刻的自己</p>
        <h2>
          有行动，
          <br />
          就有新的线索。
        </h2>
        <p>你不需要现在做最终决定。选一件能减少不确定性的事，完成后再回来。</p>
        <div className="note-line" />
        <p className="muted">
          {record.stage === "revisiting"
            ? "行动结果已保存，可以结合新信息重新整理。"
            : "如果条件、反馈或行动结果有变化，可以更新总结。"}
        </p>
        <button
          className="button secondary"
          disabled={pending || dirty || hasStale}
          onClick={summarize}
        >
          <Sparkles size={16} />
          {summary.freshness === "stale" ? "结合新信息更新总结" : "重新梳理总结"}
        </button>
        {dirty && <small className="muted">请先保存你的总结修改。</small>}
        {hasStale && <small className="muted">先回工作台更新路径与情境。</small>}
      </aside>
    </div>
  );
}
