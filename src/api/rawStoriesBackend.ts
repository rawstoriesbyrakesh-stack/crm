const getApiBase = () => {
  const envVal = import.meta.env.VITE_RAWSTORIES_API_BASE;
  const isProdHost = typeof window !== 'undefined' && window.location && !window.location.hostname.includes('localhost');
  
  if (isProdHost) {
    return '/_/backend';
  }
  return envVal || 'http://localhost:8787';
};

const RAWSTORIES_API_BASE = getApiBase();

export const rawStoriesApiUrl = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const pathPrefix = path.startsWith('/') ? '' : '/';
  return `${RAWSTORIES_API_BASE}${pathPrefix}${path}`;
};

/**
 * Returns a backend thumbnail URL for a given S3 key (or presigned URL).
 * The backend resizes the image to `size` px and returns WebP (~20-50 KB).
 * Falls back to the original URL if key cannot be extracted.
 */
export const getThumbnailUrl = (keyOrPresignedUrl: string, size = 400): string => {
  if (!keyOrPresignedUrl) return keyOrPresignedUrl;
  // If it looks like an S3 key (no http), use it directly
  let key = keyOrPresignedUrl;
  if (keyOrPresignedUrl.startsWith('http')) {
    // Extract the path from the URL (before the query string), strip leading slash and bucket name
    try {
      const u = new URL(keyOrPresignedUrl);
      // path is like /bucketname/folder/file.jpg or /folder/file.jpg
      let p = decodeURIComponent(u.pathname);
      // Remove leading slash
      if (p.startsWith('/')) p = p.slice(1);
      // If path starts with bucket name, remove it
      const bucket = import.meta.env.VITE_S3_BUCKET || 'raw';
      if (p.startsWith(bucket + '/')) p = p.slice(bucket.length + 1);
      key = p;
    } catch {
      return keyOrPresignedUrl; // cannot parse, use original
    }
  }
  return rawStoriesApiUrl(`/default/thumbnail?key=${encodeURIComponent(key)}&size=${size}`);
};

export const isRawStoriesAuthenticated = () => Boolean(localStorage.getItem('rawstories_session_token'));

export const getRawStoriesToken = () => localStorage.getItem('rawstories_session_token') || '';

export const setRawStoriesSession = (token: string) => {
  localStorage.setItem('rawstories_session_token', token);
  try {
    // Notify same-window listeners that auth changed
    window.dispatchEvent(new Event('rawstories_session_changed'));
  } catch (e) {
    // ignore in non-browser environments
  }
};

export const clearRawStoriesSession = () => {
  localStorage.removeItem('rawstories_session_token');
};
