import { lazy, Suspense, useEffect, useRef } from 'react';
import { DocumentPreview } from './DocumentFileUi.jsx';
import './file-preview.css';

const PdfPages = lazy(() => import('./PdfPages.jsx'));

export default function FilePreviewRouter({
  preview,
  onClose,
  onDownload,
}) {
  const dialog = useRef(null);
  const custom = ['pdf', 'unsupported'].includes(preview.kind);

  useEffect(() => {
    if (!custom) return;

    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    dialog.current.showModal();
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [custom]);

  if (!custom) {
    return (
      <DocumentPreview
        preview={preview}
        onClose={onClose}
      />
    );
  }

  return (
    <dialog
      ref={dialog}
      className="td-file-preview"
      aria-label={`Preview: ${preview.title}`}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <strong title={preview.title}>
          {preview.title}
        </strong>

        <button
          type="button"
          onClick={onClose}
          autoFocus
          aria-label="Close preview"
        >
          Close
        </button>
      </header>

      {preview.kind === 'pdf' ? (
        <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
          <PdfPages url={preview.url} />
        </Suspense>
      ) : (
        <section className="td-preview-unavailable">
          <h2>Preview unavailable for this file type</h2>
          <p>
            Download it to open it in a compatible application.
          </p>

          <button type="button" onClick={onDownload}>
            Download file
          </button>
        </section>
      )}
    </dialog>
  );
}
