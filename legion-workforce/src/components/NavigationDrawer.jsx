import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowRight, LogOut } from "lucide-react";
import {workplaceModules,getWorkplaceGroupsForRole,canAccessWorkplaceModule} from "../lib/workplaceModules.js";

export default function NavigationDrawer({ open, items, activeView, onNavigate, onClose, onSignOut, name, role, avatarSrc }) {
  const panel = useRef(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button")?.focus();
    function keydown(event) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const nodes = [...panel.current.querySelectorAll("button,input,summary,a[href]")].filter(node => !node.disabled && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  const search = query.trim().toLowerCase();
  const matches = items.filter(item => item.label.toLowerCase().includes(search));
  const pageIds = new Set(items.map(item => item.id));

const groups = getWorkplaceGroupsForRole(role)
  .map(group => ({
    ...group,
    modules: group.modules.filter(module =>
      `${module.title} ${group.label}`.toLowerCase().includes(search)
    )
  }))
  .filter(group => group.modules.length);
  return <div className="drawer-layer">
    <button className="drawer-backdrop" aria-label="Close menu" tabIndex={-1} onClick={onClose} />
    <section ref={panel} id="workspace-menu" className="navigation-drawer" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <header className="drawer-header"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="menu-title">Menu</h2></div><button className="icon-button" onClick={onClose} aria-label="Close menu"><X size={20} /></button></header>
      <label className="drawer-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a tool" aria-label="Search menu" /></label>
      <div className="drawer-scroll">
        <nav aria-label="Workspace pages" className="drawer-pages">{matches.map(item => { const Icon = item.icon; return <button key={item.id} aria-current={activeView === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}><Icon size={19} /><span>{item.label}</span><ArrowRight size={15} /></button>; })}</nav>
        <p className="drawer-section-label">WORKPLACE TOOLS</p>
        {groups.map(group => <details className="drawer-group" key={`${group.id}-${Boolean(search)}`} open={search ? true : undefined}><summary>{group.label}<span>{group.modules.length}</span></summary><div>{group.modules.map(module => <button key={module.id} onClick={() => module.nativeView && !["directory", "search"].includes(module.nativeView) ? onNavigate(module.nativeView) : onNavigate("suite", module.id)}>{module.title}<ArrowRight size={14} /></button>)}</div></details>)}
        {!matches.length && !groups.length && <p className="drawer-empty">No matching tools. Try another name.</p>}
      </div>
      <footer className="drawer-profile">
  <span className="drawer-avatar" aria-hidden="true">
    <span>
      {(name || "Employee")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase()}
    </span>

    {avatarSrc && (
      <img
        key={avatarSrc}
        src={avatarSrc}
        alt=""
        onError={event => {
          event.currentTarget.style.display = "none";
        }}
      />
    )}
  </span>

  <div>
    <strong>{name}</strong>
    <span>{role || "Employee"}</span>
  </div>
</footer>
    </section>
  </div>;
}
