/**
 * Centralized API Service for RetailSphere Frontend
 * Connects to the Python Flask Backend via HTTP.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  try {
    const response = await fetch(url, config);
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage = (data && data.message) || response.statusText || 'API request failed';
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${options.method || 'GET'} ${url}:`, err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Authentication API
// -----------------------------------------------------------------------------
export const authAPI = {
  login: async (username, password) => {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  register: async (username, password, role = 'cashier') => {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
  },

  logout: async () => {
    return request('/api/auth/logout', {
      method: 'POST'
    });
  },

  getMe: async () => {
    return request('/api/auth/me');
  }
};

// -----------------------------------------------------------------------------
// Dashboard API
// -----------------------------------------------------------------------------
export const dashboardAPI = {
  getStats: async () => {
    return request('/api/dashboard/stats');
  }
};

// -----------------------------------------------------------------------------
// Products & Inventory API
// -----------------------------------------------------------------------------
export const productsAPI = {
  getProducts: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.subcategory) params.append('subcategory', filters.subcategory);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/products${qs}`);
  },

  addProduct: async (product) => {
    return request('/api/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  },

  updatePrice: async (id, newPrice, discount) => {
    const payload = { new_price: newPrice };
    if (discount !== undefined && discount !== null && discount !== '') {
      payload.discount = discount;
    }
    return request(`/api/products/${id}/price`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  updateDiscount: async (id, discount) => {
    return request(`/api/products/${id}/discount`, {
      method: 'PUT',
      body: JSON.stringify({ discount })
    });
  },

  restock: async (id, addedStock, discount) => {
    const payload = { added_stock: addedStock };
    if (discount !== undefined && discount !== null && discount !== '') {
      payload.discount = discount;
    }
    return request(`/api/products/${id}/restock`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteProduct: async (id) => {
    return request(`/api/products/${id}`, {
      method: 'DELETE'
    });
  },

  getCategories: async () => {
    return request('/api/products/categories');
  }
};

// -----------------------------------------------------------------------------
// Customers API
// -----------------------------------------------------------------------------
export const customersAPI = {
  getCustomers: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/customers${qs}`);
  },

  addCustomer: async (customer) => {
    return request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customer)
    });
  },

  checkCustomer: async (id) => {
    return request(`/api/customers/${id}`);
  }
};

// -----------------------------------------------------------------------------
// POS & Billing API
// -----------------------------------------------------------------------------
export const posAPI = {
  checkout: async (checkoutData) => {
    return request('/api/pos/checkout', {
      method: 'POST',
      body: JSON.stringify(checkoutData)
    });
  }
};

// -----------------------------------------------------------------------------
// Orders History API
// -----------------------------------------------------------------------------
export const ordersAPI = {
  getOrders: async (limit = 50) => {
    return request(`/api/orders?limit=${limit}`);
  }
};

// -----------------------------------------------------------------------------
// Analytics API
// -----------------------------------------------------------------------------
export const analyticsAPI = {
  getAnalytics: async (year) => {
    const qs = year ? `?year=${year}` : '';
    return request(`/api/analytics${qs}`);
  }
};

// -----------------------------------------------------------------------------
// Charts API
// -----------------------------------------------------------------------------
export const chartsAPI = {
  getChartData: async (year) => {
    const qs = year ? `?year=${year}` : '';
    return request(`/api/chart-data${qs}`);
  }
};

export default {
  auth: authAPI,
  dashboard: dashboardAPI,
  products: productsAPI,
  customers: customersAPI,
  pos: posAPI,
  orders: ordersAPI,
  analytics: analyticsAPI,
  charts: chartsAPI
};
