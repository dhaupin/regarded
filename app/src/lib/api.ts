/**
 * API Client
 * 
 * Centralized API client with auth headers.
 * Use this instead of direct fetch calls.
 */

const API_URL = typeof window !== 'undefined' 
  ? (import.meta.env.VITE_API_URL || '/api')
  : '/api';

/**
 * Get auth headers for requests
 */
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('auth_token')
    : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Parse response and handle errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ 
      error: { message: 'Request failed', code: 'UNKNOWN' } 
    }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  return data.data || data;
}

/**
 * GET request
 */
export async function apiGet<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
  let url = `${API_URL}${endpoint}`;
  
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, String(value));
    }
    url += `?${searchParams.toString()}`;
  }
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  
  return handleResponse<T>(response);
}

/**
 * POST request
 */
export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  
  return handleResponse<T>(response);
}

/**
 * PUT request
 */
export async function apiPut<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  
  return handleResponse<T>(response);
}

/**
 * DELETE request
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse<T>(response);
}

/**
 * Get raw response for webhook testing
 */
export async function apiRaw(method: string, url: string, body?: unknown): Promise<{ ok: boolean; status: number; data?: unknown }> {
  const response = await fetch(url, {
    method,
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const data = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export default { apiGet, apiPost, apiPut, apiDelete, apiRaw };
