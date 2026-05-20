const RAWSTORIES_API_BASE = import.meta.env.VITE_RAWSTORIES_API_BASE
  || (import.meta.env.PROD ? '/_/backend' : 'http://localhost:8787');

export const rawStoriesApiUrl = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const pathPrefix = path.startsWith('/') ? '' : '/';
  return `${RAWSTORIES_API_BASE}${pathPrefix}${path}`;
};

export const isRawStoriesAuthenticated = () => Boolean(localStorage.getItem('rawstories_session_token'));

export const getRawStoriesToken = () => localStorage.getItem('rawstories_session_token') || '';

export const setRawStoriesSession = (token: string) => {
  localStorage.setItem('rawstories_session_token', token);
};

export const clearRawStoriesSession = () => {
  localStorage.removeItem('rawstories_session_token');
};
