import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  FolderOpen,
  ChevronRight,
} from "lucide-react";

import DocsWiki from "./DocsWiki.jsx";
import DocumentLibrary from "./DocumentLibrary.jsx";
import "./knowledge-workspace.css";

const sections = [
  {
    id: "wiki",
    title: "Company wiki",
    description: "Policies, procedures and practical guides",
    icon: BookOpen,
  },
  {
    id: "documents",
    title: "Document library",
    description: "Company files, forms and templates",
    icon: FolderOpen,
  },
];

export default function DocsWorkspace(props) {
  const [tab, setTab] = useState("wiki");
  const root = useRef(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        const target = change.target;

        if (target.dataset.activityTarget !== "true") {
          continue;
        }

        const panel = target.closest("[data-knowledge-tab]");
        const nextTab = panel?.dataset.knowledgeTab;

        if (sections.some(section => section.id === nextTab)) {
          setTab(nextTab);
        }
      }
    });

    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-activity-target"],
    });

    return () => observer.disconnect();
  }, []);

  const selected = sections.find(section => section.id === tab);

  return (
    <section className="td-knowledge" ref={root}>
      <header className="td-knowledge-heading">
        <div className="td-knowledge-heading-icon">
          <BookOpen size={24} aria-hidden="true" />
        </div>

        <div>
          <p className="td-knowledge-eyebrow">
            TECH DEV WORKSPACE
          </p>
          <h1>Knowledge hub</h1>
          <p>
            Find company guidance and the documents you
            need to do your work.
          </p>
        </div>
      </header>

      <div className="td-knowledge-layout">
        <aside className="td-knowledge-sidebar">
          <p className="td-knowledge-nav-label">LIBRARY</p>

          <nav aria-label="Knowledge sections">
            {sections.map(section => {
              const Icon = section.icon;
              const active = tab === section.id;

              return (
                <button
                  type="button"
                  key={section.id}
                  className="td-knowledge-nav-item"
                  aria-current={active ? "page" : undefined}
                  aria-controls={`techdev-${section.id}-panel`}
                  onClick={() => setTab(section.id)}
                >
                  <Icon size={20} aria-hidden="true" />

                  <span>
                    <strong>{section.title}</strong>
                    <small>{section.description}</small>
                  </span>

                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </nav>

          <div className="td-knowledge-help">
            <FileText size={19} aria-hidden="true" />
            <strong>A place for shared knowledge</strong>
            <p>
              Use the wiki for instructions and guidance.
              Use Documents for files people need to
              preview or download.
            </p>
          </div>
        </aside>

        <div className="td-knowledge-content">
          <div
            className="td-knowledge-breadcrumb"
            aria-label="Current section"
          >
            <span>Knowledge hub</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{selected.title}</strong>
          </div>

          <div
            id="techdev-wiki-panel"
            data-knowledge-tab="wiki"
            hidden={tab !== "wiki"}
          >
            <DocsWiki key={props.userId} {...props} />
          </div>

          <div
            id="techdev-documents-panel"
            data-knowledge-tab="documents"
            hidden={tab !== "documents"}
          >
            <DocumentLibrary key={props.userId} {...props} />
          </div>
        </div>
      </div>
    </section>
  );
}