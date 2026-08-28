import { useState } from "react";
import type { ReactNode } from "react";
import { CODE_TO_MAC_KEYCODE, RESERVED_CODES, macKeyCodeLabel } from "../lib/keycodes";

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

/** 点一下、按一个真实按键，就把这个物理键采集下来存成快捷键——
 * 不管接的是什么牌子/布局的键盘，采集到的都是它实际上报的键。 */
export function HotkeyField({ value, onChange }: { value: number; onChange: (code: number) => void }) {
  const [capturing, setCapturing] = useState(false);
  const [warn, setWarn] = useState("");

  function startCapture() {
    setWarn("");
    setCapturing(true);
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      const mac = CODE_TO_MAC_KEYCODE[e.code];
      if (mac === undefined || RESERVED_CODES.has(e.code)) {
        setWarn("这个键不能用，换一个试试");
        return;
      }
      onChange(mac);
      setCapturing(false);
      setWarn("");
      window.removeEventListener("keydown", onKeyDown, true);
    };
    window.addEventListener("keydown", onKeyDown, true);
  }

  return (
    <span className="hotkey-field">
      <kbd>{macKeyCodeLabel(value)}</kbd>
      <button type="button" className="hotkey-set" onClick={startCapture}>
        {capturing ? "按下要用的键…" : "点击设置"}
      </button>
      {warn && <em className="hotkey-warn">{warn}</em>}
    </span>
  );
}
