import { Upload as TusUpload } from 'tus-js-client';
import { supabase } from './supabase.js';

let refreshing;

function validJwt(token) {
  return typeof token === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export async function tdUploadSession(userId, force = false) {
  let result = await supabase.auth.getSession();
  let session = result.data?.session;

  if (
    result.error ||
    !userId ||
    session?.user?.id !== userId
  ) {
    throw new Error(
      'Your account changed. Sign in again before uploading.'
    );
  }

  if (
    force ||
    !validJwt(session.access_token) ||
    !session.expires_at ||
    session.expires_at * 1000 < Date.now() + 60000
  ) {
    if (!refreshing) {
      refreshing = supabase.auth.refreshSession().finally(() => {
        refreshing = null;
      });
    }

    result = await refreshing;
    session = result.data?.session;
  }

  if (
    result.error ||
    session?.user?.id !== userId ||
    !validJwt(session.access_token)
  ) {
    throw new Error(
      'Your upload session is invalid. Sign out and sign in again.'
    );
  }

  return session;
}

export function tdStorageEndpoint() {
  const base = new URL(
    import.meta.env.VITE_SUPABASE_URL || supabase.supabaseUrl
  );

  base.hostname = base.hostname.replace(
    /^([a-z0-9]+)\.supabase\.co$/i,
    '$1.storage.supabase.co'
  );

  return new URL(
    '/storage/v1/upload/resumable',
    base
  ).href;
}

export function tdUploadAuthError(error) {
  const response = error.originalResponse;
  const status = Number(
    response?.getStatus?.() || error.statusCode || 0
  );

  const body = String(
    response?.getBody?.() || error.message || ''
  );

  return status === 401 ||
    /Invalid Compact JWS|InvalidJWT|JWT.*expired|token.*expired|invalid.*token/i
      .test(body);
}

export function tdUploadRetry(error) {
  const status = Number(
    error.originalResponse?.getStatus?.() || 0
  );

  return globalThis.navigator?.onLine !== false && (
    status === 0 ||
    status === 408 ||
    status === 423 ||
    status === 429 ||
    status >= 500
  );
}

class SmallUpload {
  constructor(file, options) {
    this.file = file;
    this.options = options;
    this.url = null;
    this.running = false;
    this.aborted = false;
  }

  async findPreviousUploads() {
    return [];
  }

  resumeFromPreviousUpload() {}

  start() {
    if (this.running) return;
    this.running = true;
    this.aborted = false;
    void this.send(0);
  }

  async abort() {
    this.aborted = true;
    clearTimeout(this.timer);
    this.xhr?.abort();
    this.running = false;
  }

  async send(attempt) {
    const options = this.options;

    try {
      const metadata = options.metadata;
      const url = new URL(options.endpoint);

      url.pathname = '/storage/v1/object/' +
        [
          metadata.bucketName,
          ...metadata.objectName.split('/'),
        ].map(encodeURIComponent).join('/');

      const xhr = new XMLHttpRequest();
      this.xhr = xhr;

      xhr.open('POST', url.href, true);
      xhr.timeout = 300000;

      for (
        const [name, value] of Object.entries(options.headers || {})
      ) {
        xhr.setRequestHeader(name, value);
      }

      xhr.setRequestHeader(
        'Content-Type',
        metadata.contentType || 'application/octet-stream'
      );

      xhr.setRequestHeader(
        'Cache-Control',
        'max-age=' + (metadata.cacheControl || '0')
      );

      const request = {
        setHeader: (name, value) =>
          xhr.setRequestHeader(name, value),
        getMethod: () => 'POST',
        getURL: () => url.href,
        getUnderlyingObject: () => xhr,
      };

      await options.onBeforeRequest?.(request);
      if (this.aborted) return;

      const response = {
        getStatus: () => xhr.status,
        getBody: () => xhr.responseText || '',
        getHeader: name => xhr.getResponseHeader(name),
        getUnderlyingObject: () => xhr,
      };

      const failed = () => {
        if (this.aborted) return;

        let detail = {};
        try {
          detail = JSON.parse(xhr.responseText || '{}');
        } catch {}

        const error = new Error(
          detail.message ||
          detail.error ||
          'Upload interrupted. Check your connection and try again.'
        );

        error.statusCode = String(
          detail.statusCode || xhr.status || 0
        );
        error.originalResponse = response;
        error.originalRequest = request;

        const delays = options.retryDelays || [];

        if (
          attempt < delays.length &&
          options.onShouldRetry?.(error, attempt, options)
        ) {
          this.timer = setTimeout(() => {
            if (!this.aborted) void this.send(attempt + 1);
          }, delays[attempt]);
        } else {
          this.running = false;
          options.onError?.(error);
        }
      };

      xhr.upload.onprogress = event => {
        if (!this.aborted) {
          options.onProgress?.(
            Math.min(event.loaded, this.file.size),
            this.file.size
          );
        }
      };

      xhr.onload = () => {
        if (this.aborted) return;

        if (xhr.status >= 200 && xhr.status < 300) {
          this.running = false;
          this.url = url.href;

          options.onProgress?.(
            this.file.size,
            this.file.size
          );

          options.onSuccess?.({
            lastResponse: response,
          });
        } else {
          failed();
        }
      };

      xhr.onerror = failed;
      xhr.ontimeout = failed;
      xhr.send(this.file);
    } catch (error) {
      this.running = false;
      if (!this.aborted) options.onError?.(error);
    }
  }
}

export class TdSmartUpload {
  constructor(file, options) {
    return file.size <= 6 * 1024 * 1024
      ? new SmallUpload(file, options)
      : new TusUpload(file, options);
  }
}
