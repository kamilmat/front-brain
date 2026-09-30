import { useEffect } from 'react';
import { LoadedDock } from './components/LoadedDock';
import { PerfMonitorButton } from './components/PerfMonitor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DEMOS, SECTIONS } from './demos/registry';
import { DevicePage } from './pages/Device';
import { HomePage } from './pages/Home';
import { ModelsPage } from './pages/Models';
import { SectionPage } from './pages/Section';
import { href, useRoute } from './router';

const TOP = [...SECTIONS.map((s) => ({ id: s.id, label: s.title, icon: s.icon })), { id: 'models', label: 'Models', icon: '📦' }, { id: 'device', label: 'Device', icon: '🖥️' }];

export function App() {
  const route = useRoute();
  const section = SECTIONS.find((s) => s.id === route.section);
  const demo = DEMOS.find((d) => d.id === route.page);

  useEffect(() => {
    const top = TOP.find((t) => t.id === route.section);
    document.title = [demo?.title, top?.label, 'Front Brain'].filter(Boolean).join(' · ');
  }, [route, demo]);

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">🧠 Front Brain</a>
        <nav className="topnav">
          {TOP.map((t) => (
            <a key={t.id} href={href(t.id)} className={route.section === t.id ? 'active' : ''}>
              <span className="nav-icon">{t.icon}</span> {t.label}
            </a>
          ))}
        </nav>
        <div className="row">
          <PerfMonitorButton />
          <LoadedDock />
        </div>
      </header>
      <main>
        <ErrorBoundary key={route.section + '/' + (route.page ?? '')}>
        {section ? (
          <SectionPage sectionId={section.id} page={route.page} />
        ) : route.section === 'models' ? (
          <Page title="📦 Models" desc="What's in memory, what's downloaded, and what's available – with a fit estimate for this device.">
            <ModelsPage tab={(['loaded', 'downloaded', 'catalog'].includes(route.page ?? '') ? route.page : 'loaded') as any} setTab={(t) => (location.hash = href('models', t))} />
          </Page>
        ) : route.section === 'device' ? (
          <Page title="🖥️ Device" desc="What this browser and hardware can do.">
            <DevicePage />
          </Page>
        ) : (
          <HomePage />
        )}
        </ErrorBoundary>
      </main>
      <footer className="footer">
        Built on <code>@front-brain/*</code> packages · Transformers.js · WebLLM · MediaPipe · ONNX Runtime Web · Chrome built-in AI
      </footer>
    </div>
  );
}

function Page({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="page-head">
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      {children}
    </div>
  );
}
