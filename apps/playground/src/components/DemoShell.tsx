import type { ReactNode } from 'react';
import type { Demo } from '../lib/useDemo';
import { ModelPanel } from './ModelPanel';
import { Card, ErrorBox, RunButton, Stats } from './ui';

/** Two-column layout: playground on the left, model panel on the right (stacked on mobile). */
export function DemoGrid({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="demo-grid">
      <div className="demo-main">{children}</div>
      <aside className="demo-aside">{aside}</aside>
    </div>
  );
}

/** Standard Transformers.js demo: inputs → Run → stats/errors → output. */
export function DemoShell(props: { d: Demo; onRun?: () => void; runLabel?: string; runDisabled?: boolean; children?: ReactNode; output?: ReactNode }) {
  const { d } = props;
  const p = d.pipe;
  return (
    <DemoGrid aside={<ModelPanel d={d} />}>
      <Card title="Input">
        {props.children}
        {props.onRun && (
          <div className="row wrap">
            <RunButton busy={p.busy} onClick={props.onRun} label={props.runLabel} disabled={props.runDisabled || !d.choice.model} />
            {!p.loaded && !p.busy && <span className="hint">First run downloads the model.</span>}
            <Stats stats={p.stats} />
          </div>
        )}
        {p.busy && Object.keys(p.files).length > 0 && <p className="hint">Downloading model – see the panel.</p>}
        {!p.busy && <ErrorBox error={p.error} />}
      </Card>
      {props.output}
    </DemoGrid>
  );
}
