import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => API.post('/auth/login', data),
  profile: () => API.get('/auth/profile'),
};

export const adminAPI = {
  // Stats
  getStats: () => API.get('/admin/stats'),
  // Agents
  createAgent: (data) => API.post('/admin/agents', data),
  getAgents: () => API.get('/admin/agents'),
  getAgent: (id) => API.get(`/admin/agents/${id}`),
  updateAgent: (id, data) => API.put(`/admin/agents/${id}`, data),
  toggleAgent: (id) => API.patch(`/admin/agents/${id}/toggle`),
  deleteAgent: (id) => API.delete(`/admin/agents/${id}`),
  // Merchants
  createMerchant: (data) => API.post('/admin/merchants', data),
  getMerchants: () => API.get('/admin/merchants'),
  getMerchant: (id) => API.get(`/admin/merchants/${id}`),
  updateMerchant: (id, data) => API.put(`/admin/merchants/${id}`, data),
  toggleMerchant: (id) => API.patch(`/admin/merchants/${id}/toggle`),
  assignAgent: (merchantId, data) => API.post(`/admin/merchants/${merchantId}/assign-agent`, data),
  removeAgent: (merchantId, agentId) => API.delete(`/admin/merchants/${merchantId}/agents/${agentId}`),
  getMerchantStats: (id) => API.get(`/admin/merchants/${id}/stats`),
  getMerchantLedger: (id, params) => API.get(`/admin/merchants/${id}/ledger`, { params }),
  // Payments
  getPayments: (params) => API.get('/admin/payments', { params }),
  // Settlements
  getSettlements: (params) => API.get('/admin/settlements', { params }),
  createSettlement: (data) => API.post('/admin/settlements', data),
  updateSettlement: (id, data) => API.patch(`/admin/settlements/${id}/status`, data),
};

export const merchantAPI = {
  createPayment: (data) => API.post('/merchant/payment', data),
  submitUTR: (paymentId, data) => API.post(`/merchant/payment/${paymentId}/utr`, data),
  getPayments: (params) => API.get('/merchant/payments', { params }),
  getLedger: (params) => API.get('/merchant/ledger', { params }),
  getBalance: () => API.get('/merchant/balance'),
  getSettlements: () => API.get('/merchant/settlements'),
};

export default API;
