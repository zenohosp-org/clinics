import { Component } from "react";

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="hms-error-boundary">
          <div className="hms-error-boundary__card">
            <div className="hms-error-boundary__emoji">⚠️</div>
            <h1 className="hms-error-boundary__title">Something went wrong</h1>
            <p className="hms-error-boundary__msg">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
