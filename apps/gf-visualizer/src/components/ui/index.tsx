// ─────────────────────────────────────────────────────────────────────────────
// Small instrument-styled primitives reused across the input panels. Styling
// lives in styles/ui.css. Foundation only — the full polish pass is Milestone 7.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, type CSSProperties, type ReactNode } from 'react';
import { clamp, round } from '../../util';

export function Panel(props: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
}) {
  const { title, children, actions, subtitle, defaultOpen = true } = props;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel">
      <header className="panel-head">
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={'panel-caret' + (open ? ' is-open' : '')}>▸</span>
          <span className="panel-title">{title}</span>
          {subtitle !== undefined && <span className="panel-sub tabular">{subtitle}</span>}
        </button>
        {actions !== undefined && <div className="panel-actions">{actions}</div>}
      </header>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}

export function NumberField(props: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  width?: number | string;
}) {
  const { value, onChange, label, suffix, min, max, step = 1, decimals = 0, width } = props;
  // Local draft lets the field go empty / intermediate ("", "-", "1.") while typing.
  // Binding the input straight to `value` snaps it back and makes the box impossible to
  // clear. `draft === null` ⇒ show the canonical value; a string ⇒ the user is editing.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(round(value, decimals));
  return (
    <label className="field">
      {label !== undefined && <span className="field-label">{label}</span>}
      <span className="field-input">
        <input
          type="number"
          className="tabular field-num"
          value={display}
          min={min}
          max={max}
          step={step}
          style={width !== undefined ? { width } : undefined}
          onChange={(e) => {
            setDraft(e.target.value); // allow empty / partial input
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(clamp(v, min, max));
          }}
          onBlur={() => setDraft(null)} // snap back to the canonical value on blur
        />
        {suffix !== undefined && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  step?: number;
  color?: string;
  ariaLabel?: string;
}) {
  const { value, min, max, onChange, step = 1, color, ariaLabel } = props;
  const style = color ? ({ '--slider-color': color } as CSSProperties) : undefined;
  return (
    <input
      type="range"
      className="slider"
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      style={style}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

export function SegmentedControl<T extends string | number>(props: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const { options, value, onChange, ariaLabel } = props;
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={'seg-btn' + (o.value === value ? ' is-active' : '')}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton(props: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { onClick, title, children, disabled, danger } = props;
  return (
    <button
      type="button"
      className={'icon-btn' + (danger ? ' is-danger' : '')}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
