"use client";

import { useState } from "react";
import { Check, CornerDownRight, MessageSquare, Plus, Sparkles } from "lucide-react";
import type { DecisionView, PathView, ScenarioView } from "@/domain/decision/schemas";
import type { Generate, Mutation } from "@/features/decision/hooks/use-decision";
import { BulletList, StaleNote } from "./shared";

const feedbackLabels = { feeling: "我的感受", correction: "纠正假设", question: "还想了解" };
type FeedbackKind = keyof typeof feedbackLabels;

function ScenarioCard({
  scenario,
  pathCount,
  pending,
  mutate,
  generate,
}: {
  scenario: ScenarioView;
  pathCount: number;
  pending: boolean;
  mutate: Mutation;
  generate: Generate;
}) {
  const [kind, setKind] = useState<FeedbackKind>("feeling");
  const [text, setText] = useState("");
  const [branchOpen, setBranchOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const branchAllowed = scenario.depth < 2 && pathCount < 6 && scenario.freshness === "fresh";
  return (
    <article className={`scenario-card depth-${scenario.depth}`}>
      <div className="scenario-heading">
        <span className="scenario-time">
          {scenario.parentId && <CornerDownRight size={14} />}
          {scenario.timeframe}
        </span>
        <span className="muted">
          {scenario.depth ? `后续情境 · 第 ${scenario.depth} 层` : "可能情境"}
        </span>
      </div>
      <h3>{scenario.event}</h3>
      {scenario.freshness === "stale" && <StaleNote reason={scenario.staleReason} />}
      <div className="scenario-content">
        <div>
          <h4>可能发生的变化</h4>
          <BulletList items={scenario.changes} />
        </div>
        <div>
          <h4>需要面对的困难</h4>
          <BulletList items={scenario.difficulties} />
        </div>
      </div>
      <details className="evidence-details">
        <summary>
          看看依据与假设
          <ChevronIcon />
        </summary>
        <div className="scenario-content">
          <div>
            <h4>来自已知条件的依据</h4>
            <BulletList items={scenario.basis} empty="现有条件不足以提供明确依据" />
          </div>
          <div>
            <h4>仍需验证的假设</h4>
            <BulletList items={scenario.assumptions} empty="暂无额外假设" />
          </div>
        </div>
      </details>
      {scenario.feedback.length > 0 && (
        <div className="feedback-history">
          {scenario.feedback.map((feedback) => (
            <div className="feedback-item" key={feedback.id}>
              <div>
                <span className="feedback-kind">{feedbackLabels[feedback.kind]}</span>
                {feedback.needsReview && (
                  <span className="review-label">情境已变化 · 请重新确认</span>
                )}
              </div>
              <p>{feedback.text}</p>
              {feedback.needsReview && (
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() =>
                    void mutate(`/feedback/${feedback.id}`, "PATCH", { needsReview: false })
                  }
                >
                  <Check size={14} />
                  仍然符合我的想法
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="scenario-actions">
        <button
          className="text-button"
          aria-expanded={feedbackOpen}
          onClick={() => setFeedbackOpen((value) => !value)}
        >
          <MessageSquare size={15} />
          {feedbackOpen ? "收起反馈" : "说说我的想法"}
        </button>
        <button
          className="text-button"
          disabled={pending || !branchAllowed}
          aria-expanded={branchOpen}
          onClick={() => setBranchOpen((value) => !value)}
        >
          <Plus size={15} />
          继续探索
        </button>
      </div>
      {!branchAllowed && (
        <p className="limit-note">
          {scenario.freshness === "stale"
            ? "更新这个情境后，可以继续探索。"
            : scenario.depth >= 2
              ? "已到两层分支，可以切换其他情境比较。"
              : "这条路径已有六个情境，先整理取舍再继续。"}
        </p>
      )}
      {feedbackOpen && (
        <form
          className="feedback-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await mutate(`/scenarios/${scenario.id}/feedback`, "POST", { kind, text })) {
              setText("");
              setFeedbackOpen(false);
            }
          }}
        >
          <div className="segmented" role="group" aria-label="反馈类型">
            {(Object.keys(feedbackLabels) as FeedbackKind[]).map((value) => (
              <button
                type="button"
                aria-pressed={kind === value}
                className={kind === value ? "active" : ""}
                onClick={() => setKind(value)}
                key={value}
              >
                {feedbackLabels[value]}
              </button>
            ))}
          </div>
          <label htmlFor={`feedback-${scenario.id}`} className="sr-only">
            {feedbackLabels[kind]}
          </label>
          <textarea
            id={`feedback-${scenario.id}`}
            rows={3}
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              kind === "correction"
                ? "哪一个假设不符合实际？请写下你确认的情况。"
                : kind === "question"
                  ? "关于这个情境，你还想了解什么？"
                  : "哪些变化可以接受，哪些让你犹豫？"
            }
            required
          />
          {kind === "correction" && (
            <small className="muted">
              纠正会作为反馈保存；如果涉及事实变化，也请在概况中修改对应条件。
            </small>
          )}
          <div className="form-bottom">
            <small>想法会保留在这个情境下。</small>
            <button className="button secondary" disabled={pending || !text.trim()}>
              保存反馈
            </button>
          </div>
        </form>
      )}
      {branchOpen && branchAllowed && (
        <form
          className="branch-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await generate("branch", scenario.id, question)) {
              setBranchOpen(false);
              setQuestion("");
            }
          }}
        >
          <label htmlFor={`branch-${scenario.id}`}>如果发生这件事，你想接着探索什么？</label>
          <textarea
            id={`branch-${scenario.id}`}
            rows={2}
            maxLength={1000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：如果三个月还没有找到合适机会，接下来可以怎么办？"
            required
          />
          <div className="form-bottom">
            <small>每条路径最多六个情境、两层后续分支。</small>
            <button className="button primary" disabled={pending || !question.trim()}>
              <Sparkles size={15} />
              探索后续情境
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function ChevronIcon() {
  return <span aria-hidden="true">＋</span>;
}

export function ScenarioPanel({
  path,
  pending,
  mutate,
  generate,
}: {
  path: PathView;
  conditions: DecisionView["conditions"];
  pending: boolean;
  mutate: Mutation;
  generate: Generate;
}) {
  const scenarios = path.scenarios || [];
  // Place each follow-up directly beneath its parent, even if roots were generated together.
  const ordered: ScenarioView[] = [];
  const walk = (parentId: string | null) => {
    for (const scenario of scenarios.filter((item) => item.parentId === parentId)) {
      ordered.push(scenario);
      walk(scenario.id);
    }
  };
  walk(null);
  return (
    <section className="scenario-section" aria-label={`${path.title}的情境探索`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">正在探索这条路径</p>
          <h2>{path.title}</h2>
        </div>
        <span className="muted">{scenarios.length} / 6 个情境</span>
      </div>
      <p className="scenario-disclaimer">
        这些是基于条件的探索材料。你可以纠正假设、记录感受，或换一条路比较。
      </p>
      {scenarios.length === 0 ? (
        <div className="empty compact">
          <h3>走上这条路，生活可能发生什么变化？</h3>
          <p>从具体的时间点和事件开始，看见值得在意的取舍。</p>
          <button
            className="button primary"
            disabled={pending || path.freshness === "stale"}
            onClick={() => void generate("scenarios", path.id)}
          >
            <Sparkles size={17} />
            展开可能情境
          </button>
          {path.freshness === "stale" && <p className="muted">请先更新上方受影响的路径。</p>}
        </div>
      ) : (
        <div className="scenario-list">
          {ordered.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              pathCount={scenarios.length}
              pending={pending}
              mutate={mutate}
              generate={generate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
