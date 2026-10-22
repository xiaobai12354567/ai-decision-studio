"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { DecisionView, PathView } from "@/domain/decision/schemas";
import type { Generate, Mutation } from "@/features/decision/hooks/use-decision";
import { BulletList, LinesField, splitLines, StaleNote } from "./shared";
import { ScenarioPanel } from "./scenario-panel";

function PathEditor({
  path,
  pending,
  onSave,
  onCancel,
}: {
  path?: PathView;
  pending: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(path?.title || "");
  const [benefits, setBenefits] = useState(path?.benefits.join("\n") || "");
  const [costs, setCosts] = useState(path?.costs.join("\n") || "");
  const [prerequisites, setPrerequisites] = useState(path?.prerequisites.join("\n") || "");
  const prefix = path?.id || "new-path";
  return (
    <form
      className="path-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await onSave({
            title,
            benefits: splitLines(benefits),
            costs: splitLines(costs),
            prerequisites: splitLines(prerequisites),
          })
        )
          onCancel();
      }}
    >
      <div className="section-heading">
        <h3>{path ? "修改这条路径" : "加一条自己的路径"}</h3>
        <button className="icon-button" aria-label="取消编辑路径" type="button" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>
      <label htmlFor={`${prefix}-title`}>这条路径怎么走</label>
      <input
        id={`${prefix}-title`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        minLength={2}
        maxLength={100}
        required
        placeholder="把选择写成可以理解的行动方向"
      />
      <div className="editor-grid">
        <LinesField
          id={`${prefix}-benefits`}
          label="主要收益"
          value={benefits}
          onChange={setBenefits}
        />
        <LinesField
          id={`${prefix}-costs`}
          label="需要付出的代价"
          value={costs}
          onChange={setCosts}
        />
      </div>
      <LinesField
        id={`${prefix}-prerequisites`}
        label="关键前提"
        value={prerequisites}
        onChange={setPrerequisites}
        rows={2}
      />
      <div className="form-bottom">
        <small>写下你自己的判断，AI 生成的内容也可以随时修改。</small>
        <button className="button primary" disabled={pending || !title.trim()}>
          <Check size={16} />
          保存路径
        </button>
      </div>
    </form>
  );
}

export function PathPanel({
  record,
  pending,
  overviewDirty,
  mutate,
  generate,
}: {
  record: DecisionView;
  pending: boolean;
  overviewDirty: boolean;
  mutate: Mutation;
  generate: Generate;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const paths = record.paths || [];
  useEffect(() => {
    if (!paths.some((path) => path.id === selectedId)) setSelectedId(paths[0]?.id || null);
  }, [paths, selectedId]);
  const selected = paths.find((path) => path.id === selectedId);
  const locked = pending || overviewDirty || !record.confirmedAt;
  const staleCount =
    paths.filter((path) => path.freshness === "stale").length +
    paths.reduce(
      (count, path) =>
        count + path.scenarios.filter((scenario) => scenario.freshness === "stale").length,
      0,
    );

  return (
    <section id="paths" className="path-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">02 · 多看一种可能</p>
          <h2>不同的路，都值得看清。</h2>
          <p className="muted">比较收益、代价与前提。探索哪条路径，不代表你已经选择它。</p>
        </div>
        {paths.length > 0 && paths.length < 5 && (
          <button
            className="button secondary"
            disabled={locked || editing !== null}
            onClick={() => setEditing("new")}
          >
            <Plus size={16} />
            自己补一条
          </button>
        )}
      </div>
      {!record.confirmedAt && (
        <div className="empty compact">
          <p>先确认上方的决策概况，再开始探索。</p>
        </div>
      )}
      {record.confirmedAt && paths.length === 0 && editing !== "new" && (
        <div className="empty path-empty">
          <div className="empty-symbol">
            <ArrowRight size={24} />
          </div>
          <h3>把一个难题，打开成几条路。</h3>
          <p>
            AI 会结合你的条件，整理两到三条有实质差异的路径。
            <br />
            你也可以先写下自己的方案。
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={locked}
              onClick={() => void generate("paths")}
            >
              <Sparkles size={17} />
              生成选择路径
            </button>
            <button
              className="button secondary"
              disabled={locked}
              onClick={() => setEditing("new")}
            >
              <Plus size={16} />
              自己添加
            </button>
          </div>
        </div>
      )}
      {overviewDirty && record.confirmedAt && (
        <p className="muted">概况保存完成后，就可以继续生成和编辑路径。</p>
      )}
      {staleCount > 0 && (
        <div className="refresh-banner">
          <div>
            <strong>有 {staleCount} 项路径或情境需要更新</strong>
            <p>条件修改的影响已标注。旧内容和反馈会保留，更新后请再检查。</p>
          </div>
          <button
            className="button secondary"
            disabled={locked}
            onClick={() => void generate("refresh")}
          >
            <Sparkles size={16} />
            更新受影响内容
          </button>
        </div>
      )}
      {editing === "new" && (
        <PathEditor
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={async (body) => !!(await mutate("/paths", "POST", body))}
        />
      )}
      <div className="path-grid">
        {paths.map((path, index) => (
          <article
            className={`path-card ${selectedId === path.id ? "selected" : ""}`}
            key={path.id}
          >
            <div className="path-card-top">
              <span className="path-number">路径 {String(index + 1).padStart(2, "0")}</span>
              <details className="card-menu">
                <summary aria-label={`${path.title}的操作`}>
                  <ChevronDown size={17} />
                </summary>
                <div>
                  <button
                    disabled={locked}
                    onClick={() => {
                      setEditing(path.id);
                      setSelectedId(path.id);
                    }}
                  >
                    编辑路径
                  </button>
                  <button
                    className="danger-text"
                    disabled={locked}
                    onClick={() => setDeleting(path.id)}
                  >
                    删除路径
                  </button>
                </div>
              </details>
            </div>
            <button
              className="path-select"
              onClick={() => setSelectedId(path.id)}
              aria-pressed={selectedId === path.id}
            >
              <h3>{path.title}</h3>
              <span>
                {selectedId === path.id ? "正在探索" : "查看这条路"}
                <ArrowRight size={15} />
              </span>
            </button>
            {path.freshness === "stale" && <StaleNote reason={path.staleReason} />}
            <div className="path-facts">
              <h4>你可能获得</h4>
              <BulletList items={path.benefits} />
              <h4>你需要接受</h4>
              <BulletList items={path.costs} />
              <h4>这条路的前提</h4>
              <BulletList items={path.prerequisites} />
            </div>
            {deleting === path.id && (
              <div className="delete-confirm" role="alert">
                <p>删除这条路径？它的情境会退出当前探索，历史反馈会保留。</p>
                <div className="button-row">
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() => setDeleting(null)}
                  >
                    保留
                  </button>
                  <button
                    className="button danger"
                    disabled={pending}
                    onClick={async () => {
                      if (await mutate(`/paths/${path.id}`, "DELETE")) {
                        setDeleting(null);
                        setEditing(null);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                    确认删除
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {editing && editing !== "new" && paths.find((path) => path.id === editing) && (
        <PathEditor
          key={editing}
          path={paths.find((path) => path.id === editing)}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={async (body) => !!(await mutate(`/paths/${editing}`, "PATCH", body))}
        />
      )}
      {selected && (
        <ScenarioPanel
          path={selected}
          conditions={record.conditions}
          pending={locked}
          mutate={mutate}
          generate={generate}
        />
      )}
    </section>
  );
}
