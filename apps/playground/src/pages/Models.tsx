import { useMemo, useState } from 'react';
import { CATALOG, TASKS } from '@front-brain/catalog';
import { assessFit, FIT_ICON, formatBytes, formatMB, registry } from '@front-brain/core';
import { useCachedModels, useHardware, useLoadedModels } from '@front-brain/react';
import { Card, Tabs } from '../components/ui';
import { DEMOS, demoForTask } from '../demos/registry';
import { href } from '../router';

type Tab = 'loaded' | 'downloaded' | 'catalog';

export function ModelsPage({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const loaded = useLoadedModels();
  return (
    <>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'loaded', label: `In memory (${loaded.length})` },
          { id: 'downloaded', label: 'Downloaded (disk)' },
          { id: 'catalog', label: `Catalog (${CATALOG.length})` },
        ]}
      />
      {tab === 'loaded' && <Loaded />}
      {tab === 'downloaded' && <Downloaded />}
      {tab === 'catalog' && <Catalog />}
    </>
  );
}

function Loaded() {
  const models = useLoadedModels();
  const total = models.reduce((s, m) => s + (m.bytes ?? 0), 0);
  return (
    <Card
      title={`Loaded in memory${total ? ' · ' + formatBytes(total) : ''}`}
      actions={models.length > 0 && <button onClick={() => registry.unloadAll()}>Unload all</button>}
    >
      <p className="hint">Models stay in RAM / GPU memory until you unload them, so switching demos is instant. Unloading keeps the files on disk.</p>
      {models.length === 0 ? (
        <p className="empty">Nothing loaded. Open any demo and press Load or Run.</p>
      ) : (
        <div className="table-scroll">
          <table className="log">
            <thead>
              <tr>
                <th />
                <th>Model</th>
                <th>Runtime</th>
                <th>Task</th>
                <th>Device</th>
                <th>dtype</th>
                <th>Size</th>
                <th>Load time</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.key}>
                  <td><span className={`dot ${m.status}`} /></td>
                  <td className="mono">{m.model}</td>
                  <td>{m.runtime}</td>
                  <td>{m.task}</td>
                  <td>{m.device}</td>
                  <td>{m.dtype ?? '–'}</td>
                  <td>{m.bytes ? formatBytes(m.bytes) : m.status === 'loading' ? `${Math.round((m.progress ?? 0) * 100)}%` : '–'}</td>
                  <td>{m.loadMs ? `${(m.loadMs / 1000).toFixed(1)} s` : '–'}</td>
                  <td>{m.lastUsedAt ? new Date(m.lastUsedAt).toLocaleTimeString() : '–'}</td>
                  <td><button onClick={() => registry.unload(m.key)}>Unload</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Downloaded() {
  const { models, loading, error, refresh, remove } = useCachedModels();
  const total = models.reduce((s, m) => s + m.bytes, 0);
  return (
    <Card title={`Downloaded to this browser${total ? ' · ' + formatBytes(total) : ''}`} actions={<button onClick={refresh}>Refresh</button>}>
      <p className="hint">Weights cached in Cache Storage so the next load is offline and fast. Deleting frees disk space; the model re-downloads when used again.</p>
      {error && <pre className="error">{error}</pre>}
      {loading ? (
        <p className="hint">Scanning…</p>
      ) : models.length === 0 ? (
        <p className="empty">No downloaded models yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="log">
            <thead>
              <tr>
                <th>Model</th>
                <th>Cache</th>
                <th>Files</th>
                <th>Size</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.cache + m.id}>
                  <td className="mono">{m.id}</td>
                  <td>{m.cache}</td>
                  <td>{m.files}</td>
                  <td>{formatBytes(m.bytes)}</td>
                  <td><button onClick={() => remove(m)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Catalog() {
  const hw = useHardware();
  const [task, setTask] = useState('');
  const [q, setQ] = useState('');
  const [onlyFit, setOnlyFit] = useState(false);
  const rows = useMemo(
    () =>
      CATALOG.map((m) => ({ m, fit: hw ? assessFit({ sizeMB: m.sizeMB, needsWebGPU: m.needsWebGPU, needsF16: m.needsF16, realtime: m.runtime === 'mediapipe' }, hw) : null }))
        .filter(({ m }) => (!task || m.task === task) && (!q || m.id.toLowerCase().includes(q.toLowerCase())))
        .filter(({ fit }) => !onlyFit || (fit && ['great', 'ok'].includes(fit.fit))),
    [hw, task, q, onlyFit],
  );
  return (
    <Card title="Model catalog">
      <p className="hint">
        Curated browser-ready models (<code>@front-brain/catalog</code>). Fit is estimated for <b>this device</b> using its suggested backend. WebLLM has its own
        list of {`100+`} models in <a href={href('chat', 'webllm')}>WebLLM chat</a>. Any other Hugging Face ONNX model can be entered as “Custom” in a demo.
      </p>
      <div className="row wrap">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={task} onChange={(e) => setTask(e.target.value)}>
          <option value="">All tasks</option>
          {TASKS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} /> only good fits
        </label>
      </div>
      <div className="table-scroll">
        <table className="log">
          <thead>
            <tr>
              <th>Fit</th>
              <th>Model</th>
              <th>Task</th>
              <th>Runtime</th>
              <th>Size</th>
              <th>📱</th>
              <th>Languages</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, fit }) => {
              const demo = demoForTask(m.task);
              return (
                <tr key={m.task + m.id}>
                  <td title={fit ? `${fit.label}\n${fit.reasons.join('\n')}` : ''}>{fit ? `${FIT_ICON[fit.fit]} ${fit.label}` : '…'}</td>
                  <td className="mono">{m.id}</td>
                  <td>{m.task}</td>
                  <td>{m.runtime}</td>
                  <td>{formatMB(m.sizeMB)}</td>
                  <td>{m.mobile ? '📱' : ''}</td>
                  <td>{m.languages ?? ''}</td>
                  <td>{demo && <a href={href(demo.section, demo.id)}>Try →</a>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{rows.length} of {CATALOG.length} models · {DEMOS.length} demos</p>
    </Card>
  );
}
