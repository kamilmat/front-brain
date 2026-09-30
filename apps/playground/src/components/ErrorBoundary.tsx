import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logRun } from '@front-brain/core';

interface State {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

/** Keeps a crashing demo from blanking the whole app; shows the error, where it happened and a copyable report. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? '' });
    logRun({ demo: this.props.label ?? 'app', lib: 'ui', model: '-', note: `UI error: ${error.message}` });
  }

  report() {
    const { error, componentStack } = this.state;
    return [
      `Error: ${error?.message}`,
      `Page: ${location.hash || '#/'}`,
      `Build: ${document.querySelector('script[type="module"]')?.getAttribute('src') ?? '?'}`,
      `Browser: ${navigator.userAgent}`,
      '',
      'Stack:',
      (error?.stack ?? '').split('\n').slice(0, 12).join('\n'),
      '',
      'Components:',
      componentStack.trim().split('\n').slice(0, 8).join('\n'),
    ].join('\n');
  }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="card">
        <h3>Something broke in this view</h3>
        <pre className="error">{error.message}</pre>
        <details>
          <summary className="hint">Details for the bug report</summary>
          <pre className="output mono">{this.report()}</pre>
        </details>
        <div className="row wrap">
          <button className="primary" onClick={() => this.setState({ error: null, componentStack: '' })}>
            Try again
          </button>
          <button
            onClick={() =>
              navigator.clipboard?.writeText(this.report()).then(
                () => this.setState({ copied: true }),
                () => {},
              )
            }
          >
            {copied ? 'Copied ✓' : 'Copy details'}
          </button>
          <button onClick={() => location.reload()}>Reload page</button>
        </div>
      </section>
    );
  }
}
