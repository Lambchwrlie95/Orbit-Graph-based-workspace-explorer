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

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
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
