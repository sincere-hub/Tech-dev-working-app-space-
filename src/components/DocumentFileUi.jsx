import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import {
  Maximize2,
  Minimize2,
  MoreVertical,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import "./document-file-ui.css";

export function DocumentMoreActions({
  title,
  disabled,
  children,
}) {
  const [open, setOpen] = useState(false);

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  const button = useRef(null);
  const panel = useRef(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const anchor =
        button.current?.getBoundingClientRect();

      const menu =
        panel.current?.getBoundingClientRect();

      if (!anchor || !menu) return;

      const below = anchor.bottom + 8;

      setPosition({
        left: Math.max(
          12,
          Math.min(
            anchor.right - menu.width,
            window.innerWidth - menu.width - 12
          )
        ),

        top: Math.max(
          12,
          below + menu.height <= window.innerHeight - 12
            ? below
            : anchor.top - menu.height - 8
        ),
      });
    }

    place();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(place);

    observer?.observe(panel.current);

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    panel.current
      ?.querySelector("button:not([disabled])")
      ?.focus({ preventScroll: true });

    return () => {
      observer?.disconnect();

      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function modalIsOpen() {
      return document.querySelector(
        'dialog[open], [role="dialog"][aria-modal="true"]'
      );
    }

    function outside(event) {
      if (disabled || modalIsOpen()) return;

      if (
        !button.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function keydown(event) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        modalIsOpen() ||
        disabled
      ) {
        return;
      }

      event.preventDefault();
      setOpen(false);

      button.current?.focus({
        preventScroll: true,
      });
    }

    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        outside
      );

      document.removeEventListener(
        "keydown",
        keydown
      );
    };
  }, [open, disabled]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="ld-open td-file-more-button"
        aria-label={`More actions for ${title}`}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
      >
        <MoreVertical size={19} />
      </button>

      {createPortal(
        <div className="legion-docs legion-files td-file-more-host">
          <div
            ref={panel}
            id={id}
            className="td-file-more-panel"
            role="group"
            aria-label={`Actions for ${title}`}
            hidden={!open}
            style={position}
          >
            <p className="td-file-more-heading">
              Document actions
            </p>

            <div className="td-file-more-items">
              {children}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function DocumentPreview({
  preview,
  onClose,
}) {
  const dialog = useRef(null);
  const viewport = useRef(null);
  const fitMode = useRef(true);
  const close = useRef(onClose);

  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [imageSize, setImageSize] = useState(null);
  const [failed, setFailed] = useState(false);

  const isImage = Boolean(preview.url);

  close.current = onClose;

  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    node.showModal();

    return () => {
      if (node.open) node.close();

      document.body.style.overflow = overflow;

      if (previous?.isConnected) {
        previous.focus({
          preventScroll: true,
        });
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (
      !isImage ||
      !imageSize ||
      !viewport.current
    ) {
      return;
    }

    function measure() {
      const view = viewport.current;

      if (!view) return;

      const next = Math.max(
        0.01,
        Math.min(
          (view.clientWidth - 32) / imageSize.width,
          (view.clientHeight - 32) / imageSize.height,
          1
        )
      );

      setFitScale(next);

      if (fitMode.current) {
        setScale(next);
      }
    }

    measure();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);

    observer?.observe(viewport.current);

    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();

      window.removeEventListener(
        "resize",
        measure
      );
    };
  }, [isImage, imageSize, expanded]);

  function zoom(direction) {
    fitMode.current = false;

    setScale(value =>
      Math.min(
        isImage ? 5 : 2.5,
        Math.max(
          isImage ? 0.01 : 0.75,
          Math.round(
            (value + direction * 0.25) * 100
          ) / 100
        )
      )
    );
  }

  function reset() {
    fitMode.current = true;
    setScale(isImage ? fitScale : 1);

    viewport.current?.scrollTo?.({
      top: 0,
      left: 0,
    });
  }

  return createPortal(
    <dialog
      ref={dialog}
      className={`td-file-preview${
        expanded ? " is-expanded" : ""
      }`}
      aria-label={`Preview ${preview.title}`}
      onCancel={event => {
        event.preventDefault();
        close.current?.();
      }}
    >
      <header className="td-file-preview-header">
        <h2>{preview.title}</h2>

        <button
          type="button"
          aria-label="Close document preview"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      <div
        className="td-file-preview-toolbar"
        role="group"
        aria-label="Preview controls"
      >
        <button
          type="button"
          aria-label="Zoom out"
          disabled={
            isImage
              ? !imageSize || failed || scale <= 0.01
              : scale <= 0.75
          }
          onClick={() => zoom(-1)}
        >
          <ZoomOut size={18} />
        </button>

        <output aria-label="Zoom level">
          {Math.round(scale * 100)}%
        </output>

        <button
          type="button"
          aria-label="Zoom in"
          disabled={
            isImage
              ? !imageSize || failed || scale >= 5
              : scale >= 2.5
          }
          onClick={() => zoom(1)}
        >
          <ZoomIn size={18} />
        </button>

        <button
          type="button"
          disabled={
            isImage && (!imageSize || failed)
          }
          onClick={reset}
        >
          <RotateCcw size={16} />
          {isImage ? "Fit image" : "Reset"}
        </button>

        <button
          type="button"
          className="td-file-preview-expand"
          aria-label={
            expanded
              ? "Restore preview size"
              : "Expand preview"
          }
          aria-pressed={expanded}
          onClick={() =>
            setExpanded(value => !value)
          }
        >
          {expanded ? (
            <Minimize2 size={17} />
          ) : (
            <Maximize2 size={17} />
          )}

          {expanded ? "Restore" : "Expand"}
        </button>
      </div>

      <div
        ref={viewport}
        className="td-file-preview-viewport"
        tabIndex={0}
        aria-label="File content. Scroll to view a zoomed image."
      >
        {isImage ? (
          failed ? (
            <p
              className="td-file-preview-note"
              role="alert"
            >
              The image could not be displayed.
              Close this preview and download the
              file instead.
            </p>
          ) : (
            <div
              className="td-file-image-stage"
              style={
                imageSize
                  ? {
                      width:
                        imageSize.width * scale + 32,
                      height:
                        imageSize.height * scale + 32,
                    }
                  : undefined
              }
            >
              <img
                src={preview.url}
                alt={preview.title}
                draggable={false}
                style={
                  imageSize
                    ? {
                        width:
                          imageSize.width * scale,
                        height:
                          imageSize.height * scale,
                      }
                    : {
                        maxWidth: "100%",
                        maxHeight: "100%",
                      }
                }
                onLoad={event => {
                  const image = event.currentTarget;

                  setImageSize({
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  });
                }}
                onError={() => setFailed(true)}
              />
            </div>
          )
        ) : (
          <pre
            className="td-file-preview-text"
            style={{
              fontSize: `${14 * scale}px`,
            }}
          >
            {preview.text}
          </pre>
        )}
      </div>

      <p className="td-file-preview-note">
        {preview.truncated
          ? "Showing the first 100 KB. Download the file to read all of it."
          : isImage
            ? "Use + and − to zoom, scroll to move around, or expand for a larger view."
            : "Use + and − to change the text size."}
      </p>
    </dialog>,
    document.body
  );
}