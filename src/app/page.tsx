"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, ArrowRight, NotebookPen } from "lucide-react";
import { api } from "@/features/decision/api";
import type { DecisionView } from "@/domain/decision/schemas";

const progressLabel = (item: DecisionView) =>
  item.stage === "revisiting"
    ? "行动回访"
    : item.stage === "action_selected"
      ? "已有下一步"
      : item.paths?.length
        ? "探索中"
        : item.confirmedAt
          ? "概况已确认"
          : "整理中";

export default function Home() {
  const [items, setItems] = useState<DecisionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api<DecisionView[]>("/api/decisions")
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="container">
      <section className="hero">
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>
            重要的选择，
            <br />
            从一个小小的<span>下一步</span>开始。
          </h1>
          <p className="lead">
            不急着给人生一个答案。整理条件，看看不同的可能，
            <br className="desktop" />
            找到此刻真正值得去验证的事。
          </p>
          <Link href="/decisions/new" className="button primary">
            <Plus size={18} />
            开启一份新决策
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <aside className="intro-note">
          <span className="note-number">01 / 想清楚</span>
          <h2>
            不是替你选择，
            <br />
            是陪你看清。
          </h2>
          <p>
            写下你的困境
            <br />
            整理现实条件
            <br />
            确认你在意的取舍
          </p>
          <div className="note-line" />
          <small>先把问题放到纸面上。</small>
        </aside>
      </section>
      <section className="history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MY DECISIONS</p>
            <h2>正在思考的事</h2>
          </div>
          <span className="muted">{items.length} 份决策</span>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {loading ? (
          <div className="empty" role="status">
            正在找回你的决策…
          </div>
        ) : items.length ? (
          <div className="decision-grid">
            {items.map((item) => (
              <Link className="decision-card" href={`/decisions/${item.id}`} key={item.id}>
                <span className="badge">{progressLabel(item)}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="card-bottom">
                  <small>{new Date(item.updatedAt).toLocaleDateString("zh-CN")} 更新</small>
                  <ArrowRight size={20} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          !error && (
            <div className="empty">
              <NotebookPen size={32} />
              <h3>给正在纠结的事，一个安放的位置。</h3>
              <p>换一份工作，去另一座城市，或者先试一小步。</p>
              <Link href="/decisions/new" className="text-link">
                写下第一份决策 <ArrowRight size={16} />
              </Link>
            </div>
          )
        )}
      </section>
    </div>
  );
}
