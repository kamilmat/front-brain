import { useRef, useState } from 'react';
import type { Snippet } from '../lib/snippets';

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => {},
        )
      }
    >
      {done ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

/** "</> Use in your project" button + dialog with copy-paste code for the current model settings. */
export function UseInProject({ title, getSnippets, disabled }: { title: string; getSnippets: () => Snippet[]; disabled?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [tab, setTab] = useState(0);
  const s = snippets[tab];

  return (
    <>
      <button
        className="use-btn"
        disabled={disabled}
        onClick={() => {
          setSnippets(getSnippets());
          ref.current?.showModal();
        }}
      >
        {'</>'} Use in your project
      </button>
      <dialog ref={ref} className="code-dialog" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="code-dialog-body">
          <header className="card-head">
            <h3>Use {title} in your project</h3>
            <button onClick={() => ref.current?.close()} aria-label="Close">
              ✕
            </button>
          </header>
          <p className="hint">Code for the model, device and dtype currently selected. Change them in the panel and reopen to update.</p>
          <div className="tabs" role="tablist">
            {snippets.map((x, i) => (
              <button key={x.id} role="tab" aria-selected={tab === i} className={tab === i ? 'tab active' : 'tab'} onClick={() => setTab(i)}>
                {x.label}
              </button>
            ))}
          </div>
          {s && (
            <>
              <div className="code-block">
                <div className="code-head">
                  <span>Install</span>
                  <CopyButton text={s.install} />
                </div>
                <pre>
                  <code>{s.install}</code>
                </pre>
              </div>
              <div className="code-block">
                <div className="code-head">
                  <span>Code</span>
                  <CopyButton text={s.code} />
                </div>
                <pre>
                  <code>{s.code}</code>
                </pre>
              </div>
              {s.notes && s.notes.length > 0 && (
                <ul className="notes">
                  {s.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
