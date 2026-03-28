import { Component } from "react";

// Catches any unhandled render errors so a blank screen is never shown.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[VaakSiddhi] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0D0818", color: "#F2EBE0",
          padding: "24px", textAlign: "center", fontFamily: "'Sora', sans-serif"
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🕉</div>
          <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 24, marginBottom: 12, color: "#FF8C55" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: "rgba(242,235,224,0.5)", marginBottom: 24, maxWidth: 320 }}>
            An unexpected error occurred. Please reload the page to continue your practice.
          </p>
          <p style={{ fontSize: 12, color: "rgba(242,235,224,0.25)", marginBottom: 24, fontFamily: "monospace", maxWidth: 360, wordBreak: "break-word" }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 28px", borderRadius: 50,
              background: "linear-gradient(135deg, #FF6B2B, #D94F10)",
              color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
              border: "none"
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
