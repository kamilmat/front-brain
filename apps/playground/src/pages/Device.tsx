import { useEffect, useState } from 'react';
import { detectEnv, formatMB, registry, clearAllCaches, type EnvInfo } from '@front-brain/core';
import { useHardware } from '@front-brain/react';
import { Card } from '../components/ui';

function Row({ k, v, ok }: { k: string; v: React.ReactNode; ok?: boolean }) {
  return (
    <tr>
      <th>{k}</th>
      <td className={ok === undefined ? '' : ok ? 'ok' : 'bad'}>{v}</td>
    </tr>
  );
}

const coiEnabled = () => {
  try {
    return localStorage.getItem('fb:coi') === '1';
  } catch {
    return false;
  }
};

const TIER_TEXT = {
  high: 'Desktop-class GPU. Small and mid LLMs (up to ~3–8B in WebLLM), all vision/audio models, real-time video.',
  mid: 'Capable device. Most vision/audio models and 0.5–1B LLMs; bigger LLMs may be slow or crash.',
  low: 'CPU only / low memory. Stick to ✅ and 📱 models; LLM chat will be slow or unavailable.',
};

export function DevicePage() {
  const hw = useHardware();
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    detectEnv().then(setEnv);
  }, []);

  return (
    <div className="page-grid">
      <Card title="Summary">
        {hw ? (
          <>
            <p className="big">
              Tier: <b>{hw.tier.toUpperCase()}</b> · safe model budget ≈ {formatMB(hw.budgetMB)}
            </p>
            <p className="hint">{TIER_TEXT[hw.tier]}</p>
            <p className="hint">The budget drives the ✅ / ⚠️ / 🟥 hints next to every model. They are advisory – nothing is blocked.</p>
          </>
        ) : (
          <p className="hint">Detecting…</p>
        )}
      </Card>
      {env && (
        <Card title="Hardware & browser">
          <table className="kv">
            <tbody>
              <Row k="Form factor" v={env.mobile ? 'mobile' : 'desktop'} />
              <Row k="CPU threads" v={env.cores} />
              <Row k="RAM (navigator.deviceMemory)" v={env.deviceMemoryGB ? `${env.deviceMemoryGB} GB (browser caps this value)` : 'unknown (non-Chromium)'} />
              <Row k="WebGPU" v={env.webgpu ? 'yes' : 'no'} ok={env.webgpu} />
              {env.gpu && (
                <>
                  <Row k="GPU" v={[env.gpu.vendor, env.gpu.architecture, env.gpu.description].filter(Boolean).join(' / ') || 'hidden by browser'} />
                  <Row k="shader-f16" v={env.gpu.f16 ? 'yes' : 'no'} ok={env.gpu.f16} />
                  <Row k="maxBufferSize" v={`${env.gpu.maxBufferMB} MB`} />
                  <Row k="maxStorageBufferBindingSize" v={`${env.gpu.maxStorageBufferMB} MB`} />
                </>
              )}
              <Row k="WebNN" v={env.webnn ? 'yes' : 'no'} />
              <Row k="WASM SIMD" v={env.wasmSimd ? 'yes' : 'no'} ok={env.wasmSimd} />
              <Row k="Cross-origin isolated (WASM threads)" v={env.crossOriginIsolated ? 'yes' : 'no'} ok={env.crossOriginIsolated} />
              <Row k="Storage used / quota" v={env.storage ? `${formatMB(env.storage.usageMB)} / ${formatMB(env.storage.quotaMB)}` : '?'} />
              <Row k="User agent" v={<small>{env.userAgent}</small>} />
            </tbody>
          </table>
        </Card>
      )}
      {env && (
        <Card title="Chrome built-in AI (Gemini Nano)">
          <table className="kv">
            <tbody>
              {Object.entries(env.chromeAI).map(([k, v]) => (
                <Row key={k} k={k} v={v} ok={v === 'available' ? true : v === 'not present' ? false : undefined} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card title="Tools">
        <div className="row wrap">
          <button
            onClick={() => {
              try {
                localStorage.setItem('fb:coi', coiEnabled() ? '0' : '1');
              } catch {
                /* ignore */
              }
              location.reload();
            }}
          >
            {coiEnabled() ? 'Disable' : 'Enable'} multi-threaded WASM (cross-origin isolation)
          </button>
          <button onClick={() => registry.unloadAll().then(() => setMsg('All models unloaded from memory.'))}>Unload all models</button>
          <button onClick={async () => setMsg(`Deleted caches: ${(await clearAllCaches()).join(', ') || 'none'}`)}>Delete all downloaded models</button>
        </div>
        <p className="hint">
          GitHub Pages can't send COOP/COEP headers, so thread support is enabled through a service worker. It speeds up CPU inference but may block
          resources from hosts without CORS.
        </p>
        {msg && <p className="hint">{msg}</p>}
      </Card>
    </div>
  );
}
