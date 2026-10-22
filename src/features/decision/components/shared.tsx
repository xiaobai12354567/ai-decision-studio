import { LoaderCircle, RefreshCw } from "lucide-react";

export function BusyNote({ text }: { text: string }) {
  return text ? (
    <div className="busy-note" role="status">
      <LoaderCircle size={17} className="spin" />
      <span>
        {text}
        <small>完整结果会在校验后显示，你的现有内容会保留。</small>
      </span>
    </div>
  ) : null;
}

export function StaleNote({ reason }: { reason?: string | null }) {
  return (
    <div className="stale-note">
      <RefreshCw size={15} />
      <span>{reason || "条件已变化，这份内容需要重新检查。"}</span>
    </div>
  );
}

export function BulletList({ items, empty = "暂未填写" }: { items: string[]; empty?: string }) {
  return items.length ? (
    <ul className="content-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">{empty}</p>
  );
}

export function LinesField({
  id,
  label,
  value,
  onChange,
  maxLength = 3000,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <span className="label-hint">每行一项</span>
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export const splitLines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
