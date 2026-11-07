export class ApiError extends Error {
  constructor(message, status, code, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0, 'network');
  }
  let json = null;
  try { json = await response.json(); } catch { /* empty body */ }
  if (!response.ok) {
    // A 401 anywhere except the sign-in calls themselves means the session ended.
    if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && !path.startsWith('/auth/me')) {
      window.dispatchEvent(new Event('optima:signed-out'));
    }
    throw new ApiError(json?.error || `Request failed (${response.status}).`, response.status, json?.code, json);
  }
  return json;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path, body) => request('DELETE', path, body),
};

/* Uploads one file as a raw body. Returns the parsed JSON. */
export async function uploadFile(path, file) {
  let response;
  try {
    response = await fetch(`/api${path}?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0, 'network');
  }
  let json = null;
  try { json = await response.json(); } catch { /* empty body */ }
  if (!response.ok) throw new ApiError(json?.error || `Upload failed (${response.status}).`, response.status, json?.code);
  return json;
}
