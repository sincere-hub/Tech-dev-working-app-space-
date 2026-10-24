import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { registerOfflineShell } from "./lib/offlineWorkspace.js";

class AppBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="setup-screen app-crash-screen"><section className="setup-card app-crash-card"><img src="/techdev-mark.png" width="96" height="96" alt="TechDev"/><h1>Let’s reopen your workspace.</h1><p>TechDev could not open this screen. Reload and try again, or contact your administrator if the problem continues.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload workspace</button></section></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(<AppBoundary><App /></AppBoundary>);
registerOfflineShell();