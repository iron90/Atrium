import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// The backend snapshot is trusted blindly (typed IPC), so a malformed payload
// can throw during render; this boundary keeps the window recoverable
// instead of showing a blank screen.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Atrium render failed", error, info.componentStack);
  }

  private readonly reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h1>Atrium hit an unexpected error</h1>
          <pre>{this.state.error.message}</pre>
          <button type="button" onClick={this.reload}>
            Reload Atrium
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
