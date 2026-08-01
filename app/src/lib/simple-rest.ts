import { DataProvider } from '@refinedev/core';

const API_URL = typeof window !== 'undefined' 
  ? (import.meta.env.VITE_API_URL || '/api')
  : '/api';

// Get auth token from localStorage
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

export const dataProvider = (baseUrl: string = API_URL): DataProvider => ({
  getList: async ({ resource, pagination, filters, sorters }) => {
    const url = new URL(`${baseUrl}/${resource}`, window.location.origin);
    
    if (pagination) {
      url.searchParams.set('_page', String(pagination.current || 1));
      url.searchParams.set('_limit', String(pagination.pageSize || 10));
    }
    
    if (filters && filters.length > 0) {
      url.searchParams.set('_filters', JSON.stringify(filters));
    }
    
    if (sorters && sorters.length > 0) {
      url.searchParams.set('_sort', JSON.stringify(sorters));
    }

    const response = await fetch(url.toString(), {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch');
    }

    const data = await response.json();
    
    return {
      data: data.items || data.data || [],
      total: data.total || data.data?.length || 0,
    };
  },

  getOne: async ({ resource, id }) => {
    const response = await fetch(`${baseUrl}/${resource}/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch');
    }

    const data = await response.json();
    return { data: data.data || data };
  },

  create: async ({ resource, variables }) => {
    const response = await fetch(`${baseUrl}/${resource}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(variables),
    });

    if (!response.ok) {
      throw new Error('Failed to create');
    }

    const data = await response.json();
    return { data: data.data || data };
  },

  update: async ({ resource, id, variables }) => {
    const response = await fetch(`${baseUrl}/${resource}/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(variables),
    });

    if (!response.ok) {
      throw new Error('Failed to update');
    }

    const data = await response.json();
    return { data: data.data || data };
  },

  deleteOne: async ({ resource, id }) => {
    const response = await fetch(`${baseUrl}/${resource}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete');
    }

    const data = await response.json();
    return { data: data.data || data };
  },

  getApiUrl: () => baseUrl,

  custom: async ({ url, method = 'GET', headers = {}, payload }) => {
    const response = await fetch(url, {
      method,
      headers: {
        ...getAuthHeaders(),
        ...headers,
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const data = await response.json();
    return { data: data.data || data };
  },
});
