"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "@/features/decision/api";
import type { DecisionView } from "@/domain/decision/schemas";

export default function NewDecision() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<DecisionView>("/api/decisions", {
        method: "POST",
        body: JSON.stringify({ description }),
      });
      router.push(`/decisions/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="narrow">
      <Link href="/" className="back">
        <ArrowLeft size={16} />
        我的决策
      </Link>
      <p className="eyebrow">STEP 01 · 描述困境</p>
      <h1>
        最近，什么让你
        <br />
        迟迟做不了决定？
      </h1>
      <p className="lead">不用组织得很完美。从你现在的想法开始就好。</p>
      <form className="paper" onSubmit={submit}>
        <label htmlFor="description">我正在纠结的事</label>
        <textarea
          id="description"
          required
          minLength={10}
          maxLength={4000}
          rows={7}
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例如：我想去上海工作，但担心生活成本和离家太远。现在的工作比较稳定，不过成长空间有限……"
        />
        <div className="field-note">
          <span>目前支持职业与城市选择</span>
          <span>{description.length} / 4000</span>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-bottom">
          <small>先保存草稿，下一步再整理条件。</small>
          <button className="button primary" disabled={busy || description.trim().length < 10}>
            {busy ? "正在保存…" : "开始整理"}
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
