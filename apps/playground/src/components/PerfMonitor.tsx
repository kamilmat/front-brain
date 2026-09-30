import { useEffect, useState } from 'react';
import { formatMB, perfSupport, type CpuPressure } from '@front-brain/core';
import { useLoadedModels } from '@front-brain/react';
import { setPerfMonitoring, usePerfHistory } from '../lib/perfStore';

const PRESSURE: Record<CpuPressure, { icon: string; label: string; cls: string }> = {
  nominal: { icon: '●', label: 'Nominal', cls: 'good' },
  fair: { icon: '▲', label: 'Fair', cls: 'warn' },
  serious: { icon: '▲', label: 'Serious', cls: 'serious' },
  critical: { icon: '■', label: 'Critical', cls: 'critical' },
};

/** Single-series sparkline (0..max), 2px line, hover shows the latest values. */
function Sparkline({ values, max, label, unit }: { values: number[]; max: number; label: string; unit: string }) {
  const W = 120;
  const H = 28;
  if (values.length < 2) return <svg className="spark" width={W} height={H} aria-hidden="true" />;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - (Math.min(v, max) / max) * (H - 4)).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${last}${unit}`}>
      <title>{`${label} – last ${values.length} s: now ${last}${unit}, max ${Math.max(...values)}${unit}`}</title>
      <line x1="0" x2={W} y1={H - 2} y2={H - 2} className="spark-base" />
      <polyline points={pts} className="spark-line" />
    </svg>
  );
}

function Tile({ label, value, hint, children }: { label: string; value: React.ReactNode; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="perf-tile" title={hint}>
      <span className="perf-label">{label}</span>
      <b className="perf-value">{value}</b>
      {children}
    </div>
  );
}

export function PerfMonitorButton() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('fb:perf') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    setPerfMonitoring(open);
    try {
      localStorage.setItem('fb:perf', open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);
  return (
    <>
      <button className={open ? 'dock-btn active' : 'dock-btn'} onClick={() => setOpen((o) => !o)} aria-pressed={open} title="Live load monitor">
        📈
      </button>
      {open && <PerfPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function PerfPanel({ onClose }: { onClose: () => void }) {
  const history = usePerfHistory();
  const models = useLoadedModels();
  const [collapsed, setCollapsed] = useState(false);
  const s = history[history.length - 1];
  const sup = perfSupport();
  const busyHistory = (key: string) => history.map((h) => Math.round((h.models.find((m) => m.key === key)?.busy ?? 0) * 100));

  return (
    <aside className={`perf-panel${collapsed ? ' collapsed' : ''}`} aria-label="Live load monitor">
      <header className="perf-head">
        <b>📈 Live load</b>
        <div className="row">
          <button className="chip" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button className="chip" onClick={onClose} aria-label="Close monitor">
            ✕
          </button>
        </div>
      </header>
      {!collapsed && (
        <>
          {!s ? (
            <p className="hint">Collecting…</p>
          ) : (
            <div className="perf-tiles">
              <Tile label="UI FPS" value={s.fps} hint="Main-thread animation frames per second – drops when the page is janky.">
                <Sparkline values={history.map((h) => h.fps)} max={Math.max(60, ...history.map((h) => h.fps))} label="FPS" unit="" />
              </Tile>
              <Tile label="Main-thread lag" value={`${s.lagMs} ms`} hint="Worst delay of a 50 ms timer in the last second – how blocked the UI thread is.">
                <Sparkline values={history.map((h) => h.lagMs)} max={Math.max(100, ...history.map((h) => h.lagMs))} label="Lag" unit=" ms" />
              </Tile>
              <Tile label="Long tasks" value={s.longTaskMs == null ? 'n/a' : `${s.longTaskMs} ms/s`} hint="Time spent in tasks longer than 50 ms (Chromium only)." />
              <Tile label="JS heap (page)" value={s.heapMB == null ? 'n/a' : formatMB(s.heapMB)} hint="Main-thread JS heap (Chromium only). Worker and GPU memory are not included." />
              <Tile label="CPU pressure" value={s.cpu ? <span className={`pressure ${PRESSURE[s.cpu].cls}`}>{PRESSURE[s.cpu].icon} {PRESSURE[s.cpu].label}</span> : 'n/a'} hint="System-wide CPU pressure (Compute Pressure API, Chromium 125+)." />
              <Tile label="Model weights" value={formatMB(s.modelsMB)} hint="Sum of downloaded weights of loaded models ≈ their RAM/VRAM footprint." />
            </div>
          )}
          <div className="perf-models">
            <span className="field-label">Per model – % of time computing (last 2 s)</span>
            {models.length === 0 && <p className="hint">No models loaded.</p>}
            {models.map((m) => {
              const a = s?.models.find((x) => x.key === m.key);
              const busy = Math.round((a?.busy ?? 0) * 100);
              return (
                <div key={m.key} className="perf-model">
                  <div className="perf-model-head">
                    <span className={`dot ${a?.running ? 'loading' : m.status}`} />
                    <b title={m.model}>{m.model}</b>
                    <small>
                      {m.runtime} · {m.device}
                    </small>
                  </div>
                  <div className="perf-model-row">
                    <span className="bar">
                      <span style={{ width: `${Math.max(1, busy)}%` }} />
                    </span>
                    <b className="perf-busy">{m.status === 'loading' ? 'loading' : `${busy}%`}</b>
                    <Sparkline values={busyHistory(m.key)} max={100} label={`${m.model} busy`} unit="%" />
                  </div>
                  {a && a.calls > 0 && (
                    <small className="hint">
                      {a.callsPerSec.toFixed(1)} calls/s · avg {a.avgMs.toFixed(0)} ms · last {a.lastMs.toFixed(0)} ms
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <p className="hint perf-note">
            Browsers don’t expose per-process CPU/GPU usage. Shown: time each model spends computing, UI smoothness, memory estimates
            {!sup.cpuPressure && ', (CPU pressure needs Chrome 125+)'}. Open the browser Task Manager (Chrome: Shift+Esc) for real process CPU/memory.
          </p>
        </>
      )}
    </aside>
  );
}
