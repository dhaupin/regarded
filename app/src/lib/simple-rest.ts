import { DataProvider } from '@refinedev/core';

const API_URL = typeof window !== 'undefined' 
  ? (import.meta.env.VITE_API_URL || '/api')
  : '/api';

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
      headers: {
        'Content-Type': 'application/json',
      },
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
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch');
    }

    const data = await response.json();
    return { data };
  },

  create: async ({ resource, variables }) => {
    const response = await fetch(`${baseUrl}/${resource}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(variables),
    });

    if (!response.ok) {
      throw new Error('Failed to create');
    }

    const data = await response.json();
    return { data };
  },

  update: async ({ resource, id, variables }) => {
    const response = await fetch(`${baseUrl}/${resource}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(variables),
    });

    if (!response.ok) {
      throw new Error('Failed to update');
    }

    const data = await response.json();
    return { data };
  },

  deleteOne: async ({ resource, id }) => {
    const response = await fetch(`${baseUrl}/${resource}/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete');
    }

    const data = await response.json();
    return { data };
  },

  getApiUrl: () => baseUrl,

  custom: async ({ url, method, headers, payload }) => {
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const data = await response.json();
    return { data };
  },
});
