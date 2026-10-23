import { useEffect, useRef, useState } from "react";
import { BookOpen, FolderOpen } from "lucide-react";

import DocsWiki from "./DocsWiki.jsx";
import DocumentLibrary from "./DocumentLibrary.jsx";

export default function DocsWorkspace(props) {
  const [tab, setTab] = useState("documents");
  const root = useRef(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (
          change.target.dataset.activityTarget !== "true"
        ) {
          continue;
        }

        const panel = change.target.closest(
          "[data-knowledge-tab]"
        );

        if (panel) {
          setTab(panel.dataset.knowledgeTab);
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

  return (
    <div className="legion-knowledge" ref={root}>
      <div
        className="lk-tabs"
        role="group"
        aria-label="Knowledge sections"
      >
        <button
          type="button"
          aria-pressed={tab === "documents"}
          aria-controls="legion-documents-panel"
          onClick={() => setTab("documents")}
        >
          <FolderOpen size={18} />
          Documents
        </button>

        <button
          type="button"
          aria-pressed={tab === "wiki"}
          aria-controls="legion-wiki-panel"
          onClick={() => setTab("wiki")}
        >
          <BookOpen size={18} />
          Wiki
        </button>
      </div>

      <div
        id="legion-documents-panel"
        data-knowledge-tab="documents"
        hidden={tab !== "documents"}
      >
        <DocumentLibrary key={props.userId} {...props} />
      </div>

      <div
        id="legion-wiki-panel"
        data-knowledge-tab="wiki"
        hidden={tab !== "wiki"}
      >
        <DocsWiki key={props.userId} {...props} />
      </div>
    </div>
  );
}