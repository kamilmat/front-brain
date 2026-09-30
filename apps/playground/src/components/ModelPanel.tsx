import { findModel } from '@front-brain/catalog';
import { assessFit, formatBytes, formatMB } from '@front-brain/core';
import { FIT_ICON } from '@front-brain/core';
import { requirementsOf, type Choice, type Demo } from '../lib/useDemo';
import { Card, FitCard, Progress, Segmented } from './ui';
import { UseInProject } from './UseInProject';
import { transformersSnippets } from '../lib/snippets';

export const DTYPES = ['', 'fp32', 'fp16', 'q8', 'int8', 'uint8', 'q4', 'q4f16', 'bnb4'];

/** Side panel: pick a model, see whether it fits this device, load / unload it explicitly. */
export function ModelPanel({ d }: { d: Demo }) {
  const { choice, setChoice, presets, pipe, hw } = d;
  const meta = findModel(choice.model);
  const req = requirementsOf(meta);
  const fit = hw ? (req ? assessFit(req, hw, choice.device, choice.dtype || undefined) : assessFit({}, hw, choice.device, choice.dtype || undefined)) : null;
  const set = (p: Partial<Choice>) => setChoice({ ...choice, ...p });
  const entry = pipe.entry;

  return (
    <Card title="Model" className="model-panel">
      <label>
        Model
        <select
          value={meta ? choice.model : '__custom'}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            set({ model: p ? p.id : '', dtype: p?.dtype ?? '' });
          }}
        >
          {presets.map((p) => {
            const f = hw && assessFit(requirementsOf(p)!, hw, choice.device, p.dtype);
            return (
              <option key={p.id} value={p.id}>
                {f ? FIT_ICON[f.fit] + ' ' : ''}
                {p.id} · {formatMB(p.sizeMB)}
                {p.mobile ? ' · 📱' : ''}
              </option>
            );
          })}
          <option value="__custom">✏️ Custom Hugging Face model…</option>
        </select>
      </label>
      {!meta && (
        <label>
          Model id
          <input value={choice.model} placeholder="org/name, e.g. onnx-community/…" onChange={(e) => set({ model: e.target.value.trim() })} />
        </label>
      )}
      {meta && (
        <p className="hint">
          {meta.note} {meta.languages && <>Languages: {meta.languages}. </>}
          <a href={`https://huggingface.co/${meta.id}`} target="_blank" rel="noreferrer">
            Model card ↗
          </a>
        </p>
      )}
      <div className="field">
        <span className="field-label">Device</span>
        <Segmented
          value={choice.device}
          onChange={(device) => set({ device })}
          options={[
            { id: 'webgpu', label: 'WebGPU', title: hw?.webgpu ? 'GPU' : 'Not available here – you can still try' },
            { id: 'wasm', label: 'WASM (CPU)' },
          ]}
        />
      </div>
      <label>
        dtype (precision)
        <select value={choice.dtype} onChange={(e) => set({ dtype: e.target.value })}>
          {DTYPES.map((x) => (
            <option key={x} value={x}>
              {x || 'auto (library default)'}
            </option>
          ))}
        </select>
      </label>

      <FitCard fit={fit} device={choice.device} onApplyDevice={(device) => set({ device })} />

      <div className="load-state">
        <span className={`dot ${entry?.status ?? 'idle'}`} />
        {entry?.status === 'ready' ? (
          <span>
            Loaded{entry.bytes ? ` · ${formatBytes(entry.bytes)}` : ''}
            {entry.loadMs ? ` · ${(entry.loadMs / 1000).toFixed(1)} s` : ''}
          </span>
        ) : entry?.status === 'loading' ? (
          <span>Loading… {Math.round((entry.progress ?? 0) * 100)}%</span>
        ) : (
          <span>Not loaded – loads on first run</span>
        )}
      </div>
      <div className="row">
        <button className="primary" onClick={pipe.load} disabled={!choice.model || pipe.loading || pipe.loaded}>
          {pipe.loaded ? 'Loaded' : pipe.loading ? 'Loading…' : 'Load'}
        </button>
        <button onClick={pipe.unload} disabled={!entry || pipe.busy}>
          Unload
        </button>
      </div>
      <Progress files={pipe.files} />
      <UseInProject
        title={choice.model || 'this model'}
        disabled={!choice.model}
        getSnippets={() => transformersSnippets({ task: d.task, model: choice.model, device: choice.device, dtype: choice.dtype || undefined })}
      />
    </Card>
  );
}
