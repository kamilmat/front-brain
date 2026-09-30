import { useHardware, useLoadedModels } from '@front-brain/react';
import { formatMB } from '@front-brain/core';
import { DEMOS, SECTIONS } from '../demos/registry';
import { href } from '../router';

export function HomePage() {
  const hw = useHardware();
  const loaded = useLoadedModels();
  return (
    <>
      <section className="hero">
        <h1>AI that runs in your browser</h1>
        <p>
          Test {DEMOS.length} scenarios – chat, text, images, video and audio – with models that download once, get cached, and run locally on your CPU
          (WebAssembly) or GPU (WebGPU). Nothing is sent to a server.
        </p>
        <div className="hero-stats">
          <a className="stat" href="#/device">
            <b>{hw ? hw.tier.toUpperCase() : '…'}</b>
            <span>device tier{hw ? ` · ${hw.webgpu ? 'WebGPU' : 'no WebGPU'} · ~${formatMB(hw.budgetMB)} budget` : ''}</span>
          </a>
          <a className="stat" href="#/models">
            <b>{loaded.length}</b>
            <span>models in memory</span>
          </a>
          <a className="stat" href="#/models/catalog">
            <b>✅ ⚠️ 🟥</b>
            <span>fit hints per model – advisory, never blocking</span>
          </a>
        </div>
      </section>
      <div className="section-cards">
        {SECTIONS.map((s) => {
          const demos = DEMOS.filter((d) => d.section === s.id);
          return (
            <a key={s.id} className="section-card" href={href(s.id)}>
              <span className="section-icon">{s.icon}</span>
              <b>{s.title}</b>
              <span>{s.desc}</span>
              <small>
                {demos.length} demos · {demos.filter((d) => d.mobile).length} 📱
              </small>
            </a>
          );
        })}
      </div>
    </>
  );
}
