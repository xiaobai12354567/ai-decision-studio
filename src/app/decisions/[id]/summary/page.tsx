"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useDecision } from "@/features/decision/hooks/use-decision";
import { SummaryPanel } from "@/features/decision/components/summary-panel";
import { BusyNote } from "@/features/decision/components/shared";

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const editor = useDecision(id);
  const [dirty, setDirty] = useState(false);
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
  if (!editor.record)
    return (
      <div className="container">
        <p role={editor.error ? "alert" : "status"}>{editor.error || "正在找回总结…"}</p>
        <Link href={`/decisions/${id}`}>返回工作台</Link>
      </div>
    );
  return (
    <div className="container">
      <Link
        className="back"
        href={`/decisions/${id}`}
        onClick={(event) => {
          if (
            (dirty || editor.pending) &&
            !window.confirm("仍有未保存修改或生成任务，确定离开吗？")
          )
            event.preventDefault();
        }}
      >
        <ArrowLeft size={16} />
        返回决策工作台
      </Link>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">DECISION REFLECTION</p>
          <h1>下一步，握在你手里。</h1>
          <p className="muted">{editor.record.title}</p>
        </div>
        <span className="save-state">
          {editor.record.stage === "revisiting"
            ? "行动回访中"
            : editor.record.stage === "action_selected"
              ? "已有下一步"
              : "整理取舍"}
        </span>
      </div>
      <BusyNote text={editor.busy} />
      {editor.error && (
        <div className="error" role="alert">
          {editor.error}
          {editor.conflict && (
            <button className="text-button" onClick={() => void editor.reload()}>
              <RefreshCw size={14} />
              加载最新版本
            </button>
          )}
        </div>
      )}
      {editor.notice && (
        <p className="notice" role="status">
          {editor.notice}
        </p>
      )}
      <SummaryPanel
        record={editor.record}
        pending={editor.pending}
        generate={editor.generate}
        mutate={editor.mutate}
        onDirty={setDirty}
      />
    </div>
  );
}
