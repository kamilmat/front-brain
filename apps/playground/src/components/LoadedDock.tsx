import { useEffect, useRef, useState } from 'react';
import { formatBytes, registry } from '@front-brain/core';
import { useLoadedModels } from '@front-brain/react';

/** Top-bar indicator of models in memory with per-model unload. */
export function LoadedDock() {
  const models = useLoadedModels();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const total = models.reduce((s, m) => s + (m.bytes ?? 0), 0);
  const loading = models.some((m) => m.status === 'loading');
  return (
    <div className="dock" ref={ref}>
      <button className={models.length ? 'dock-btn active' : 'dock-btn'} onClick={() => setOpen((o) => !o)}>
        {loading ? '⏳' : '🧠'} {models.length} loaded{total ? ` · ${formatBytes(total)}` : ''}
      </button>
      {open && (
        <div className="dock-menu">
          {models.length === 0 && <p className="hint">No models in memory.</p>}
          {models.map((m) => (
            <div key={m.key} className="dock-item">
              <span className={`dot ${m.status}`} />
              <div className="dock-info">
                <b title={m.model}>{m.model}</b>
                <small>
                  {m.runtime} · {m.task} · {m.device}
                  {m.dtype ? ` · ${m.dtype}` : ''}
                  {m.bytes ? ` · ${formatBytes(m.bytes)}` : ''}
                  {m.status === 'loading' ? ` · ${Math.round((m.progress ?? 0) * 100)}%` : ''}
                </small>
              </div>
              <button onClick={() => registry.unload(m.key)}>Unload</button>
            </div>
          ))}
          <div className="row">
            {models.length > 0 && <button onClick={() => registry.unloadAll()}>Unload all</button>}
            <a href="#/models" onClick={() => setOpen(false)}>
              Manage models →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
