"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { useDecision } from "@/features/decision/hooks/use-decision";
import { OverviewPanel } from "@/features/decision/components/overview-panel";
import { PathPanel } from "@/features/decision/components/path-panel";
import { BusyNote } from "@/features/decision/components/shared";
import { api } from "@/features/decision/api";

export default function Workbench({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const editor = useDecision(id);
  const [dirty, setDirty] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ aiConfigured: boolean }>("/api/status")
      .then((status) => setAiReady(status.aiConfigured))
      .catch(() => setAiReady(null));
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || editor.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editor.pending]);
  const record = editor.record;
  if (!record)
    return (
      <div className="container">
        <p role={editor.error ? "alert" : "status"}>{editor.error || "正在打开决策…"}</p>
        <Link href="/" className="text-link">
          返回我的决策
        </Link>
      </div>
    );
  return (
    <div className="container workspace">
      <Link
        href="/"
        className="back"
        onClick={(event) => {
          if ((dirty || editor.pending) && !window.confirm("仍有编辑或生成尚未保存，确定离开吗？"))
            event.preventDefault();
        }}
      >
        <ArrowLeft size={16} />
        我的决策
      </Link>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">DECISION WORKSPACE</p>
          <h1>{record.title}</h1>
        </div>
        <span className="save-state">
          {editor.pending ? editor.busy || "处理中…" : dirty ? "修改待保存" : "已保存"} · v
          {record.revision}
        </span>
      </div>
      <div className="workspace-grid">
        <aside className="workspace-sidebar">
          <div className="paper context">
            <span className="badge">最初的想法</span>
            <p>{record.description}</p>
          </div>
          <div className="steps">
            <a href="#overview" className="step active">
              <span>{record.confirmedAt ? <Check size={14} /> : "01"}</span>
              <div>
                整理决策概况<small>确认事实与重要条件</small>
              </div>
            </a>
            <a href="#paths" className={`step ${record.paths.length ? "active" : ""}`}>
              <span>02</span>
              <div>
                探索不同路径<small>比较收益、代价与前提</small>
              </div>
            </a>
            <Link
              href={`/decisions/${id}/summary`}
              className={`step ${record.summary ? "active" : ""}`}
              onClick={(event) => {
                if (dirty || editor.pending) event.preventDefault();
              }}
              aria-disabled={dirty || editor.pending}
            >
              <span>03</span>
              <div>
                找到下一步行动<small>带着可验证的事向前走</small>
              </div>
            </Link>
          </div>
          {aiReady !== null && (
            <p className="ai-status">
              <span className={aiReady ? "status-dot" : "status-dot unavailable"} />
              {aiReady ? "AI 探索已就绪" : "AI 尚未配置，可先手动整理"}
            </p>
          )}
          <p className="sidebar-note">你可以随时回到概况修改条件。受影响的路径和情境会提示更新。</p>
        </aside>
        <div className="workspace-main">
          <BusyNote text={editor.busy} />
          {editor.error && (
            <div className="error" role="alert">
              {editor.error}
              {editor.conflict && (
                <button
                  className="text-button"
                  disabled={editor.pending}
                  onClick={() => void editor.reload()}
                >
                  <RefreshCw size={14} />
                  加载最新版本，保留我的概况草稿
                </button>
              )}
            </div>
          )}
          {editor.notice && (
            <p className="notice" role="status">
              {editor.notice}
            </p>
          )}
          <div id="overview">
            <OverviewPanel
              record={record}
              pending={editor.pending}
              mutate={editor.mutate}
              clarify={editor.clarify}
              onDirty={setDirty}
              onNotice={editor.setNotice}
            />
          </div>
          <PathPanel
            record={record}
            pending={editor.pending}
            overviewDirty={dirty || editor.conflict}
            mutate={editor.mutate}
            generate={editor.generate}
          />
          {record.paths.length > 0 && (
            <div className="summary-invitation">
              <div>
                <p className="eyebrow">03 · 收拢思绪</p>
                <h2>不用马上决定，先找到下一步。</h2>
                <p>整理你在意的取舍，把未知变成可以验证的行动。</p>
              </div>
              <Link
                className={`button primary ${dirty || editor.pending ? "disabled-link" : ""}`}
                href={`/decisions/${id}/summary`}
                aria-disabled={dirty || editor.pending}
                onClick={(event) => {
                  if (dirty || editor.pending) event.preventDefault();
                }}
              >
                整理总结与行动
                <ArrowRight size={17} />
              </Link>
            </div>
          )}
          {record.changes.length > 0 && (
            <details className="change-history">
              <summary>
                最近的变化与更新原因 <span>{record.changes.length} 条</span>
              </summary>
              <ol>
                {record.changes.slice(0, 12).map((item) => (
                  <li key={item.id}>
                    <span>v{item.revision}</span>
                    <div>
                      <p>{item.reason}</p>
                      {item.details.length > 0 && (
                        <details className="change-diff">
                          <summary>看看具体变化</summary>
                          {item.details.map((detail, index) => (
                            <div key={index}>
                              <strong>{detail.label}</strong>
                              <p>
                                <span>之前</span>
                                {detail.before}
                              </p>
                              <p>
                                <span>现在</span>
                                {detail.after}
                              </p>
                            </div>
                          ))}
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
