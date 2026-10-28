import {
  createElement as h,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

export function previewFor(value, appOrigin = "") {
  let url;

  try {
    url = new URL(value);
  } catch {
    return {
      src: "",
      note: "This work link is invalid.",
    };
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password
  ) {
    return {
      src: "",
      note: "A full HTTPS work link is required.",
    };
  }

  const result = {
    original: url.href,
    label: url.hostname,
    src: "",
    note: "",
  };

  if (url.origin === appOrigin) {
    return {
      ...result,
      note:
        "Use a link to the submitted design or a separate project preview.",
    };
  }

  const figmaOrigins = [
    "https://figma.com",
    "https://www.figma.com",
    "https://embed.figma.com",
  ];

  if (figmaOrigins.includes(url.origin)) {
    const validPath =
      /^\/(design|file|proto|board|slides|deck)\/[A-Za-z0-9_-]+(?:\/|$)/;

    if (!validPath.test(url.pathname)) {
      return {
        ...result,
        label: "Figma",
        note:
          "Ask the employee for the file or prototype sharing link.",
      };
    }

    url.hostname = "embed.figma.com";

    url.pathname = url.pathname.replace(
      /^\/file\//,
      "/design/",
    );

    url.searchParams.set("embed-host", "techdev");

    return {
      ...result,
      label: "Figma",
      src: url.href,
      trusted: true,
      note:
        "The reviewer must have access to this Figma file. Its existing sharing permissions still apply.",
    };
  }

  const canvaOrigins = [
    "https://canva.com",
    "https://www.canva.com",
  ];

  if (canvaOrigins.includes(url.origin)) {
    const validPath =
      /^\/design\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?\/(edit|view|watch)\/?$/;

    if (!validPath.test(url.pathname)) {
      return {
        ...result,
        label: "Canva",
        note:
          "Ask the employee for the Canva design’s embed link.",
      };
    }

    url.hostname = "www.canva.com";

    url.pathname = url.pathname.replace(
      /\/(edit|view|watch)\/?$/,
      "/view",
    );

    url.search = "?embed";

    return {
      ...result,
      label: "Canva",
      src: url.href,
      trusted: true,
      note:
        "Canva requires a published embed. Use Share → See all → Embed only if this design may be public.",
    };
  }

  if (
    ["github.com", "www.github.com"].includes(
      url.hostname,
    )
  ) {
    return {
      ...result,
      label: "GitHub",
      note:
        "For a visual review here, ask for the project’s deployed preview link. Use Open original to inspect this repository.",
    };
  }

  return {
    ...result,
    src: url.href,
    note:
      "This website must allow embedded previews. If it refuses to connect, use Open original or ask for a supported preview link.",
  };
}

export default function SubmittedWorkPreview({
  url,
  title,
  busy,
  onClose,
  children,
}) {
  const dialog = useRef(null);
  const titleId = useId();
  const [reload, setReload] = useState(0);

  const preview = previewFor(
    url,
    window.location.origin,
  );

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    element.showModal();
    document.body.style.overflow = "hidden";

    return () => {
      element.close();
      document.body.style.overflow = overflow;

      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    h(
      "dialog",
      {
        ref: dialog,
        className: "dw-workroom dw-preview-dialog",
        "aria-labelledby": titleId,

        onCancel: event => {
          event.preventDefault();

          if (!busy) onClose();
        },
      },

      h(
        "header",
        { className: "dw-preview-header" },

        h(
          "div",
          null,

          h(
            "p",
            { className: "dw-eyebrow" },
            "TECHDEV · WORK REVIEW",
          ),

          h("h2", { id: titleId }, title),

          h(
            "small",
            { className: "dw-muted" },
            preview.label || "Submitted work",
          ),
        ),

        h(
          "div",
          { className: "dw-actions" },

          preview.original &&
            h(
              "a",
              {
                className: "dw-button",
                href: preview.original,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "Open original ↗",
            ),

          h(
            "button",
            {
              type: "button",
              className: "dw-button",
              autoFocus: true,
              disabled: busy,
              onClick: onClose,
            },
            "Close preview",
          ),
        ),
      ),

      h(
        "div",
        { className: "dw-preview-layout" },

        h(
          "section",
          {
            className: "dw-preview-canvas",
            "aria-label": "Submitted work preview",
          },

          preview.src
            ? h("iframe", {
                key: `${preview.src}:${reload}`,
                src: preview.src,
                title: `${preview.label}: ${title}`,
                allowFullScreen: true,
                referrerPolicy:
                  "strict-origin-when-cross-origin",

                sandbox: preview.trusted
                  ? "allow-scripts allow-same-origin allow-forms allow-popups allow-storage-access-by-user-activation"
                  : "allow-scripts allow-forms allow-popups",
              })
            : h(
                "div",
                { className: "dw-preview-empty" },

                h(
                  "h3",
                  null,
                  "A different preview link is needed",
                ),

                h("p", null, preview.note),
              ),

          h(
            "div",
            { className: "dw-preview-help" },

            preview.src &&
              h("p", null, preview.note),

            preview.src &&
              h(
                "button",
                {
                  type: "button",
                  className: "dw-button",

                  onClick: () =>
                    setReload(value => value + 1),
                },
                "Reload preview",
              ),
          ),
        ),

        h(
          "aside",
          {
            className: "dw-preview-review",
            "aria-label": "Review and feedback",
          },
          children,
        ),
      ),
    ),

    document.body,
  );
}