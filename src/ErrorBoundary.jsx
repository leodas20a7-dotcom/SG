import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    
    // Auto-reload on chunk load error or Vite module graph corruption (common when dev server restarts)
    const isChunkLoadError = 
      error?.name === "ChunkLoadError" || 
      (error?.message && error.message.includes("dynamically imported module")) ||
      (error?.message && error.message.includes("reading 'useState'")) ||
      (error?.message && error.message.includes("resolveDispatcher() is null")) ||
      (error?.message && error.message.includes("dispatcher")) ||
      (error?.message && error.message.includes("useState") && error.message.includes("null"));
      
    if (isChunkLoadError) {
      const lastReload = sessionStorage.getItem("chunk_reload_time");
      if (!lastReload || Date.now() - parseInt(lastReload) > 10000) {
        sessionStorage.setItem("chunk_reload_time", Date.now().toString());
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center bg-red-50 border border-red-200 rounded-2xl my-4 flex flex-col items-center">
          <h2 className="text-lg font-bold text-red-700 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-650 mb-4">We encountered an issue loading this section.</p>
          <div className="bg-red-100 p-3 rounded-lg text-xs text-red-800 font-mono mb-4 max-w-lg text-left break-words">
            {this.state.error?.toString()}
          </div>
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
