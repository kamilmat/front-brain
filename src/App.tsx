import { Suspense, useEffect, useState } from 'react';
import { DEMOS } from './demos/registry';

const useHash = () => {
  const [hash, setHash] = useState(() => location.hash.slice(2));
  useEffect(() => {
    const on = () => setHash(location.hash.slice(2));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
};

const GROUPS = [...new Set(DEMOS.map((d) => d.group))];

export function App() {
  const route = useHash();
  const [navOpen, setNavOpen] = useState(false);
  const demo = DEMOS.find((d) => d.id === route);
  useEffect(() => setNavOpen(false), [route]);
  useEffect(() => {
    document.title = demo ? `${demo.title} · Front Brain` : 'Front Brain – in-browser AI lab';
  }, [demo]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="menu" aria-label="Menu" onClick={() => setNavOpen((o) => !o)}>☰</button>
        <a href="#/" className="brand">🧠 Front Brain</a>
        <span className="tag">AI models running 100% in your browser</span>
      </header>
      <nav className={navOpen ? 'nav open' : 'nav'}>
        {GROUPS.map((g) => (
          <div key={g}>
            <h4>{g}</h4>
            {DEMOS.filter((d) => d.group === g).map((d) => (
              <a key={d.id} href={`#/${d.id}`} className={d.id === route ? 'active' : ''}>
                {d.title}
                {d.mobile && <span title="Runs on phones"> 📱</span>}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <main>
        {demo ? (
          <>
            <div className="page-head">
              <h2>{demo.title}</h2>
              <p>
                {demo.desc} <span className="badge">{demo.lib}</span>
              </p>
            </div>
            <Suspense fallback={<p className="hint">Loading demo…</p>}>
              <demo.component key={demo.id} />
            </Suspense>
          </>
        ) : (
          <Home />
        )}
      </main>
    </div>
  );
}

function Home() {
  return (
    <>
      <div className="page-head">
        <h2>In-browser AI lab</h2>
        <p>
          Every model here downloads once, is cached by the browser, and runs locally on your CPU (WebAssembly) or GPU (WebGPU). Nothing is sent to a server.
          Start with <a href="#/env">Environment check</a> to see what your device can handle. 📱 = works on a typical phone.
        </p>
      </div>
      {GROUPS.map((g) => (
        <section key={g}>
          <h3 className="group-title">{g}</h3>
          <div className="tiles">
            {DEMOS.filter((d) => d.group === g).map((d) => (
              <a key={d.id} className="tile" href={`#/${d.id}`}>
                <b>
                  {d.title}
                  {d.mobile && ' 📱'}
                </b>
                <span>{d.desc}</span>
                <small className="badge">{d.lib}</small>
              </a>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
