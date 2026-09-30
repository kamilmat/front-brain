import type { ReactNode } from 'react';
import { FIT_ICON, type FitAssessment } from '@front-brain/core';
import type { RunStats } from '@front-brain/transformers';
import type { FileProgress } from '@front-brain/react';

const mb = (n: number) => (n / 2 ** 20).toFixed(1);

export function Progress({ files }: { files: Record<string, FileProgress> }) {
  const list = Object.values(files);
  if (!list.length) return null;
  return (
    <div className="progress">
      {list.map((f) => (
        <div key={f.file} className="progress-row">
          <span className="progress-name" title={f.file}>{f.file}</span>
          <progress value={f.loaded} max={f.total || 1} />
          <span className="progress-num">{f.total ? `${mb(f.loaded)} / ${mb(f.total)} MB` : '…'}</span>
        </div>
      ))}
    </div>
  );
}

export function Stats({ stats }: { stats: RunStats | null }) {
  if (!stats) return null;
  const tps = stats.tokens && stats.inferMs ? (stats.tokens / (stats.inferMs / 1000)).toFixed(1) : null;
  return (
    <div className="stats">
      {stats.loadMs > 0 && <span>load {(stats.loadMs / 1000).toFixed(2)} s</span>}
      <span>inference {stats.inferMs.toFixed(0)} ms</span>
      {stats.firstTokenMs != null && <span>TTFT {stats.firstTokenMs.toFixed(0)} ms</span>}
      {tps && <span>{tps} tok/s</span>}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  return error ? <pre className="error">{error}</pre> : null;
}

export function Card({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function RunButton({ busy, onClick, label = 'Run', disabled }: { busy: boolean; onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button className="primary" onClick={onClick} disabled={busy || disabled}>
      {busy ? 'Working…' : label}
    </button>
  );
}

export function ScoreBars({ items }: { items: { label: string; score: number }[] }) {
  return (
    <ul className="bars">
      {items.map((it, i) => (
        <li key={i}>
          <span className="bar-label">{it.label}</span>
          <span className="bar">
            <span style={{ width: `${Math.max(1, it.score * 100)}%` }} />
          </span>
          <span className="bar-num">{(it.score * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function FitBadge({ fit, short }: { fit: FitAssessment | null; short?: boolean }) {
  if (!fit) return null;
  return (
    <span className={`fit fit-${fit.fit}`} title={fit.reasons.join('\n')}>
      {FIT_ICON[fit.fit]} {short ? '' : fit.label}
    </span>
  );
}

export function FitCard({ fit, onApplyDevice, device }: { fit: FitAssessment | null; onApplyDevice?: (d: 'webgpu' | 'wasm') => void; device?: string }) {
  if (!fit) return <p className="hint">Checking hardware…</p>;
  return (
    <div className={`fit-card fit-${fit.fit}`}>
      <b>
        {FIT_ICON[fit.fit]} {fit.label}
      </b>
      {fit.reasons.length > 0 && (
        <ul>
          {fit.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {onApplyDevice && device !== fit.suggestedDevice && (
        <button className="link" onClick={() => onApplyDevice(fit.suggestedDevice)}>
          Suggested device: {fit.suggestedDevice.toUpperCase()} – switch
        </button>
      )}
      <small className="hint">Advisory only – you can still load anything.</small>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'tab active' : 'tab'} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} title={o.title} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
