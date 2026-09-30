import type { ReactNode } from 'react';
import type { FileProgress, RunStats } from '../core/transformers/client';
import type { ModelChoice, ModelPreset } from '../react/useTjs';

export const DTYPES = ['', 'fp32', 'fp16', 'q8', 'int8', 'uint8', 'q4', 'q4f16', 'bnb4'];

export function ModelPicker({ presets, choice, onChange, gpu, hideDtype }: { presets: ModelPreset[]; choice: ModelChoice; onChange: (c: ModelChoice) => void; gpu: boolean; hideDtype?: boolean }) {
  const preset = presets.find((p) => p.id === choice.model);
  return (
    <div className="picker">
      <label>
        Model
        <select
          value={preset ? choice.model : '__custom'}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            onChange({ ...choice, model: p ? p.id : '', dtype: p?.dtype ?? '' });
          }}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.mobile ? '📱 ' : ''}
              {p.id}
              {p.size ? ` (${p.size})` : ''}
            </option>
          ))}
          <option value="__custom">Custom Hugging Face model id…</option>
        </select>
      </label>
      {!preset && (
        <label>
          Model id
          <input value={choice.model} placeholder="e.g. onnx-community/…" onChange={(e) => onChange({ ...choice, model: e.target.value.trim() })} />
        </label>
      )}
      <label>
        Device
        <select value={choice.device} onChange={(e) => onChange({ ...choice, device: e.target.value as ModelChoice['device'] })}>
          <option value="webgpu" disabled={!gpu}>
            WebGPU{gpu ? '' : ' (unavailable)'}
          </option>
          <option value="wasm">WASM (CPU)</option>
        </select>
      </label>
      {!hideDtype && (
        <label>
          dtype
          <select value={choice.dtype} onChange={(e) => onChange({ ...choice, dtype: e.target.value })}>
            {DTYPES.map((d) => (
              <option key={d} value={d}>
                {d || 'auto'}
              </option>
            ))}
          </select>
        </label>
      )}
      {preset?.note && <p className="hint">{preset.note}</p>}
    </div>
  );
}

const mb = (n: number) => (n / 2 ** 20).toFixed(1);

export function Progress({ files }: { files: Record<string, FileProgress> }) {
  const list = Object.values(files);
  if (!list.length) return null;
  return (
    <div className="progress">
      {list.map((f) => (
        <div key={f.file} className="progress-row">
          <span className="progress-name">{f.file}</span>
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
      <span>load {stats.loadMs ? `${(stats.loadMs / 1000).toFixed(2)} s` : 'cached'}</span>
      <span>inference {stats.inferMs.toFixed(0)} ms</span>
      {stats.firstTokenMs != null && <span>TTFT {stats.firstTokenMs.toFixed(0)} ms</span>}
      {tps && <span>{tps} tok/s</span>}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <pre className="error">{error}</pre> : null;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
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

/** Standard layout for a single transformers.js task: model picker → inputs → run → progress/stats/output. */
export function TjsPanel(props: {
  presets: ModelPreset[];
  choice: ModelChoice;
  setChoice: (c: ModelChoice) => void;
  gpu: boolean;
  tjs: { busy: boolean; files: Record<string, FileProgress>; stats: RunStats | null; error: string | null };
  /** Omit to hide the run button (e.g. chat demos drive the runner themselves). */
  onRun?: () => void;
  runLabel?: string;
  runDisabled?: boolean;
  children?: ReactNode;
  output?: ReactNode;
}) {
  const { presets, choice, setChoice, gpu, tjs } = props;
  return (
    <>
      <Card>
        <ModelPicker presets={presets} choice={choice} onChange={setChoice} gpu={gpu} />
      </Card>
      <Card>
        {props.children}
        <div className="row">
          {props.onRun && <RunButton busy={tjs.busy} onClick={props.onRun} label={props.runLabel} disabled={props.runDisabled || !choice.model} />}
          <Stats stats={tjs.stats} />
        </div>
        <Progress files={tjs.files} />
        <ErrorBox error={tjs.error} />
      </Card>
      {props.output}
    </>
  );
}
