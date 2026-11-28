import {
  Component, lazy, Suspense, useEffect, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { DocumentPreview } from './DocumentFileUi.jsx';
import './file-preview.css';

let pdfModule;

export function warmPdfPreview(name) {
  if (name && !/\.pdf$/i.test(name)) return Promise.resolve();

  return pdfModule ||= import('./PdfPages.jsx').catch(error => {
    pdfModule = null;
    throw error;
  });
}

const PdfPages = lazy(warmPdfPreview);

class PreviewBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <p role="alert">The viewer could not load. Close and try again.</p>
      : this.props.children;
  }
}

export default function FilePreviewRouter({
  preview, onClose, onDownload,
}) {
  const dialog = useRef(null);
  const custom = [
    'pdf', 'unsupported', 'loading', 'error',
  ].includes(preview.kind);

  useEffect(() => {
    if (!custom) return;

    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const node = dialog.current;

    if (!node.open) node.showModal();
    document.body.style.overflow = 'hidden';

    return () => {
      if (node.open) node.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [custom]);

  if (!custom) {
    return <DocumentPreview preview={preview} onClose={onClose} />;
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="td-fast-preview"
      aria-label={`Preview: ${preview.title}`}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <strong title={preview.title}>{preview.title}</strong>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          aria-label="Close preview"
        >
          Close
        </button>
      </header>

      {preview.kind === 'loading' ? (
        <p role="status">Opening preview…</p>
      ) : preview.kind === 'error' ? (
        <p role="alert">{preview.error}</p>
      ) : preview.kind === 'pdf' ? (
        <PreviewBoundary>
          <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
            <PdfPages
              url={preview.url}
              bytes={preview.record?.metadata?.file_size}
            />
          </Suspense>
        </PreviewBoundary>
      ) : (
        <section className="td-preview-unavailable">
          <h2>Preview unavailable for this file type</h2>
          <p>Download it to open it in a compatible application.</p>
          <button type="button" onClick={onDownload}>
            Download file
          </button>
        </section>
      )}
    </dialog>,
    document.body
  );
}
