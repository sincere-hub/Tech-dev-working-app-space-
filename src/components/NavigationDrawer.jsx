import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowRight } from "lucide-react";

import {
  getWorkplaceGroupsForRole,
} from "../lib/workplaceModules.js";

import AdminBuildButton from "./AdminBuildButton.jsx";

export default function NavigationDrawer({
  open,
  items,
  activeView,
  activeModuleId = "",
  onNavigate,
  onClose,
  name,
  role,
  avatarSrc,
  onOpenDevTests,
}) {
  const panel = useRef(null);
  const scrollArea = useRef(null);
  const scrollPosition = useRef(0);

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState({});

  const allGroups = getWorkplaceGroupsForRole(role);
  const pageIds = new Set(items.map(item => item.id));

  function isActive(module) {
    if (
      module.nativeView &&
      !["directory", "search"].includes(module.nativeView)
    ) {
      return activeView === module.nativeView;
    }

    return (
      activeView === "suite" &&
      activeModuleId === module.id
    );
  }

  const activeGroupId = allGroups.find(group =>
    group.modules.some(isActive)
  )?.id;

  useEffect(() => {
    if (open && activeGroupId) {
      setExpanded(previous =>
        previous[activeGroupId]
          ? previous
          : {
              ...previous,
              [activeGroupId]: true,
            }
      );
    }
  }, [open, activeGroupId]);

  useEffect(() => {
    if (!open) return;

    setQuery("");

    const savedScroll = scrollPosition.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    panel.current
      ?.querySelector("button")
      ?.focus({ preventScroll: true });

    const frame = window.requestAnimationFrame(() => {
      if (scrollArea.current) {
        scrollArea.current.scrollTop = savedScroll;
      }
    });

    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = [
        ...panel.current.querySelectorAll(
          "button,input,summary,a[href]"
        ),
      ].filter(
        node =>
          !node.disabled &&
          node.getClientRects().length
      );

      const first = nodes[0];
      const last = nodes.at(-1);

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", keydown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);

      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const search = query.trim().toLowerCase();

  const matches = items.filter(item =>
    item.label.toLowerCase().includes(search)
  );

  const groups = allGroups
    .map(group => ({
      ...group,

      modules: group.modules.filter(module =>
        (
          !module.nativeView ||
          ["directory", "search"].includes(
            module.nativeView
          ) ||
          pageIds.has(module.nativeView)
        ) &&
        `${module.title} ${group.label}`
          .toLowerCase()
          .includes(search)
      ),
    }))
    .filter(group => group.modules.length);

  function openTool(group, module) {
    setExpanded(previous => ({
      ...previous,
      [group.id]: true,
    }));

    if (scrollArea.current) {
      scrollPosition.current =
        scrollArea.current.scrollTop;
    }

    if (
      module.nativeView &&
      !["directory", "search"].includes(module.nativeView)
    ) {
      onNavigate(module.nativeView);
    } else {
      onNavigate("suite", module.id);
    }
  }

  return (
    <div className="drawer-layer">
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
      />

      <section
        ref={panel}
        id="workspace-menu"
        className="navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h2 id="menu-title">Menu</h2>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </header>

        <label className="drawer-search">
          <Search size={18} />

          <input
            value={query}
            onChange={event =>
              setQuery(event.target.value)
            }
            placeholder="Find a tool"
            aria-label="Search menu"
          />
        </label>

        <div
          className="drawer-scroll"
          ref={scrollArea}
          onScroll={event => {
            scrollPosition.current =
              event.currentTarget.scrollTop;
          }}
        >
          <nav
            aria-label="Workspace pages"
            className="drawer-pages"
          >
            {matches.map(item => {
              const Icon = item.icon;

              return (
                <button
                  type="button"
                  key={item.id}
                  aria-current={
                    activeView === item.id
                      ? "page"
                      : undefined
                  }
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </nav>

          <p className="drawer-section-label">
            WORKPLACE TOOLS
          </p>

          <AdminBuildButton
            role={role}
            onOpen={() => {
              onOpenDevTests?.();
              onClose();
            }}
          />

          {groups.map(group => (
            <details
              className="drawer-group"
              key={group.id}
              open={
                Boolean(search) ||
                Boolean(expanded[group.id])
              }
              onToggle={event => {
                if (
                  search ||
                  !event.currentTarget.isConnected
                ) {
                  return;
                }

                const opened = event.currentTarget.open;

                setExpanded(previous =>
                  Boolean(previous[group.id]) === opened
                    ? previous
                    : {
                        ...previous,
                        [group.id]: opened,
                      }
                );
              }}
            >
              <summary
                onClick={event => {
                  if (search) event.preventDefault();
                }}
              >
                {group.label}
                <span>{group.modules.length}</span>
              </summary>

              <div>
                {group.modules.map(module => (
                  <button
                    type="button"
                    key={module.id}
                    aria-current={
                      isActive(module)
                        ? "page"
                        : undefined
                    }
                    onClick={() =>
                      openTool(group, module)
                    }
                  >
                    {module.title}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </details>
          ))}

          {!matches.length && !groups.length && (
            <p className="drawer-empty">
              No matching tools. Try another name.
            </p>
          )}
        </div>

        <footer className="drawer-profile">
          <span
            className="drawer-avatar"
            aria-hidden="true"
          >
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
                  event.currentTarget.style.display =
                    "none";
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
    </div>
  );
}