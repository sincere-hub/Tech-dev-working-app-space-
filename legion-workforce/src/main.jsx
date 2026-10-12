import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AppBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="setup-screen"><section className="setup-card"><img src="/legion-mark.svg" width="96" height="96" alt="Legion"/><h1>Let’s reopen your workspace.</h1><p>Legion could not open this screen. Reload and try again, or contact your administrator if the problem continues.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload workspace</button></section></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(<AppBoundary><App /></AppBoundary>);
