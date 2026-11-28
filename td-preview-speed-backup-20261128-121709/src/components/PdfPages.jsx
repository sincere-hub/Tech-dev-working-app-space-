import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPages({ url }) {
  const canvas = useRef(null);
  const container = useRef(null);
  const lastRender = useRef(Promise.resolve());

  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    setPdf(null);
    setPage(1);
    setError('');
    setLoading(true);

    const task = getDocument({
      url,
      isEvalSupported: false,
    });

    task.promise
      .then(value => {
        if (active) setPdf(value);
      })
      .catch(() => {
        if (!active) return;
        setError('Could not preview this PDF. Close and try again.');
        setLoading(false);
      });

    return () => {
      active = false;
      task.destroy().catch(() => {});
    };
  }, [url]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(200, entry.contentRect.width - 32));
    });

    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;

    let active = true;
    let render;
    const previous = lastRender.current;

    setLoading(true);
    setError('');

    const job = (async () => {
      await previous.catch(() => {});
      if (!active) return;

      const sheet = await pdf.getPage(page);
      if (!active) return;

      const base = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({
        scale: Math.min(width / base.width, 1.5) * zoom,
      });

      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(
          8000000 / (viewport.width * viewport.height)
        )
      );

      const element = canvas.current;
      element.width = Math.ceil(viewport.width * ratio);
      element.height = Math.ceil(viewport.height * ratio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;

      render = sheet.render({
        canvasContext: element.getContext('2d'),
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });

      await render.promise;
    })();

    lastRender.current = job.catch(() => {});

    job.catch(failure => {
      if (
        active &&
        failure.name !== 'RenderingCancelledException'
      ) {
        setError('Could not render this PDF page.');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, width, zoom]);

  return (
    <>
      <nav aria-label="PDF controls">
        <button
          type="button"
          disabled={!pdf || page === 1}
          onClick={() => setPage(value => value - 1)}
        >
          Previous
        </button>

        <span>Page {page} / {pdf?.numPages || '…'}</span>

        <button
          type="button"
          disabled={!pdf || page === pdf.numPages}
          onClick={() => setPage(value => value + 1)}
        >
          Next
        </button>

        <button
          type="button"
          disabled={zoom <= 0.5}
          onClick={() =>
            setZoom(value => Math.max(0.5, value - 0.25))
          }
          aria-label="Zoom out"
        >
          −
        </button>

        <button type="button" onClick={() => setZoom(1)}>
          Fit
        </button>

        <button
          type="button"
          disabled={zoom >= 2}
          onClick={() =>
            setZoom(value => Math.min(2, value + 0.25))
          }
          aria-label="Zoom in"
        >
          +
        </button>
      </nav>

      <div
        ref={container}
        className="td-pdf-pages"
        aria-busy={loading}
      >
        {loading && <p role="status">Loading page…</p>}
        {error && <p role="alert">{error}</p>}

        <canvas
          ref={canvas}
          aria-label={`PDF page ${page}`}
          style={{
            visibility: error ? 'hidden' : 'visible',
          }}
        />
      </div>
    </>
  );
}
