import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    
    // Auto-reload on chunk load error (common when dev server restarts or PC wakes from sleep)
    const isChunkLoadError = 
      error?.name === "ChunkLoadError" || 
      (error?.message && error.message.includes("dynamically imported module"));
      
    if (isChunkLoadError) {
      if (!sessionStorage.getItem("chunk_reload_attempted")) {
        sessionStorage.setItem("chunk_reload_attempted", "true");
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center bg-red-50 border border-red-200 rounded-2xl my-4">
          <h2 className="text-lg font-bold text-red-700 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-650 mb-4">We encountered an issue loading this section.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-md"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
