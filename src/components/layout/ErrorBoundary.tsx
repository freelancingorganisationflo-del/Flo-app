import { Component, type ReactNode } from "react";

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-2 bg-light px-6 text-center">
          <div className="text-lg font-extrabold text-navy">Something went wrong</div>
          <p className="max-w-sm text-sm text-grey">{this.state.message ?? "An unexpected error occurred."}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-[10px] bg-teal px-4 py-2 text-sm font-extrabold text-navy"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
