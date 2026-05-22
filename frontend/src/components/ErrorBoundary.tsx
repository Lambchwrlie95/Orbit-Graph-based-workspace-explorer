import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  resetKey?: string | number | null;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  private retryTimer: number | null = null;

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    // Many in-app errors are transient stale-state on navigation: the same
    // render that just threw will succeed once parent state has settled.
    // Auto-retry once on the next microtask so the user does not have to
    // click Retry for every folder change. If the retry also throws, the
    // boundary stays errored.
    if (this.retryTimer === null) {
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        this.setState({ error: null });
      }, 60);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="surface-panel surface-error" role="alert">
        <div>
          <h2>{this.props.fallbackTitle ?? "Surface unavailable"}</h2>
          <p>{this.state.error.message || "The view failed to render."}</p>
        </div>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </section>
    );
  }
}
