import { Component, type ReactNode } from 'react';
import { logRun } from '@front-brain/core';

/** Keeps a crashing demo from blanking the whole app; shows the error with a retry button. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    logRun({ demo: this.props.label ?? 'app', lib: 'ui', model: '-', note: `UI error: ${error.message}` });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="card">
        <h3>Something broke in this view</h3>
        <pre className="error">{error.message}</pre>
        <p className="hint">Loaded models stay in memory. You can retry, or report this message.</p>
        <div className="row">
          <button className="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button onClick={() => location.reload()}>Reload page</button>
        </div>
      </section>
    );
  }
}
