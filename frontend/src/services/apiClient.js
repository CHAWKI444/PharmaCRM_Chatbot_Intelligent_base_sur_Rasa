import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 20000,
});

apiClient.interceptors.request.use((config) => {
  const savedUser = localStorage.getItem('crm_user');
  if (savedUser) {
    try {
      const { token } = JSON.parse(savedUser);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      localStorage.removeItem('crm_user');
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const status = error.response?.status;
    if ((status === 401 || status === 403) && !url.includes('/login')) {
      localStorage.removeItem('crm_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
