/**
 * WaterSight — API Client
 * Centralized axios instance with base URL and auth header handling
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ws_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ws_token');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;

// ── API Functions ────────────────────────────────────────────

// Auth
export const login = (email, password) =>
  api.post('/api/auth/login', new URLSearchParams({ username: email, password }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

export const getMe = () => api.get('/api/auth/me');

// Watersheds
export const listWatersheds = (params) => api.get('/api/watersheds', { params });
export const getWatershed = (id) => api.get(`/api/watersheds/${id}`);
export const getWatershedStats = (id, subId) =>
  api.get(`/api/watersheds/${id}/stats`, { params: { sub_watershed_id: subId } });

// Images
export const listImages = (params) => api.get('/api/images', { params });
export const getImage = (id) => api.get(`/api/images/${id}`);
export const uploadImage = (formData) =>
  api.post('/api/images/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const imageFileUrl = (id) => `${API_BASE}/api/images/${id}/file`;

// Layers
export const listLayers = (params) => api.get('/api/layers', { params });
export const sampleLayerAtPoint = (id, lat, lon) =>
  api.get(`/api/layers/${id}/point`, { params: { lat, lon } });
export const getLayerGeoJSON = (id) => api.get(`/api/layers/${id}/geojson`);

// Analytics
export const getNDVITrend = (watershedId, subId) =>
  api.get('/api/analytics/ndvi-trend', { params: { watershed_id: watershedId, sub_watershed_id: subId } });
export const getChangeDetection = (watershedId, period1, period2) =>
  api.get('/api/analytics/change-detection', { params: { watershed_id: watershedId, period1, period2 } });
export const getDashboardSummary = () => api.get('/api/analytics/summary');

// Reports
export const listReports = (watershedId) => api.get('/api/reports', { params: { watershed_id: watershedId } });
export const generateReport = (data) => api.post('/api/reports/generate', data);
export const reportDownloadUrl = (id) => `${API_BASE}/api/reports/${id}/download`;
