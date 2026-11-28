export function previewKind(name) {
  const extension = String(name || '')
    .split('.').pop().toLowerCase();

  if (/^(png|jpe?g|webp|gif|avif)$/.test(extension)) {
    return 'image';
  }

  if (/^(txt|csv|md|json|log)$/.test(extension)) {
    return 'text';
  }

  return extension === 'pdf' ? 'pdf' : 'unsupported';
}

export async function readPreviewText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let reader;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Range: 'bytes=0-100000' },
    });

    if (!response.ok) {
      throw new Error('Could not load the text preview.');
    }

    if (!response.body) {
      throw new Error('Text preview is unavailable in this browser.');
    }

    reader = response.body.getReader();
    const bytes = new Uint8Array(100001);
    let size = 0;

    while (size < bytes.length) {
      const { value, done } = await reader.read();
      if (done) break;

      const take = Math.min(value.length, bytes.length - size);
      bytes.set(value.subarray(0, take), size);
      size += take;
    }

    return {
      text: new TextDecoder().decode(
        bytes.subarray(0, Math.min(size, 100000))
      ),
      truncated: size > 100000,
    };
  } finally {
    clearTimeout(timer);
    if (reader) await reader.cancel().catch(() => {});
    controller.abort();
  }
}
