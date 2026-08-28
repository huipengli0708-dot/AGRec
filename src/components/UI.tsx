import type { ReactNode } from "react";

export function Card({ title, desc, children, right }: {
  title?: string; desc?: string; children: ReactNode; right?: ReactNode;
}) {
  return (
    <section className="card">
      {(title || right) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {desc && <p className="muted">{desc}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Slider({ value, min, max, step, onChange, format }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <b>{format ? format(value) : value}</b>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, label }: {
  value: boolean; onChange: (v: boolean) => void; label?: string;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="track"><span className="knob" /></span>
      {label && <em>{label}</em>}
    </label>
  );
}

export function Button({ children, onClick, kind = "normal", disabled }: {
  children: ReactNode; onClick?: () => void;
  kind?: "normal" | "primary" | "danger" | "ghost"; disabled?: boolean;
}) {
  return (
    <button className={`btn ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>
  );
}

export function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}
