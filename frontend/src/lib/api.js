// src/services/api.js
// ============================================================
// AXIOS HTTP CLIENT
//
// FIX SEC-01 (companion to authStore.js):
//  - Access token is now stored in a module-level variable (memory only),
//    not in localStorage. This protects it from XSS.
//  - Refresh token stays in localStorage (key: '_c_rt') so the session
//    survives tab close/refresh.
//  - setTokens() renamed to setAccessToken() — only sets the in-memory token.
//    authStore.login() handles writing the refresh token to localStorage.
// ============================================================

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const REFRESH_KEY = '_c_rt'  // Must match authStore.js

// ── In-memory access token (not in localStorage) ──────────────────────
let _accessToken = null

export const setAccessToken = (token) => { _accessToken = token }
export const getAccessToken = () => _accessToken
export const clearTokens = () => {
  _accessToken = null
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem('_c_u')
}

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// ── Debug logger ───────────────────────────────────────────────────────
const logDebug = (entry) => {
  if (localStorage.getItem('fs_debug') !== 'true') return
  try { window.__debugLog?.(entry) } catch {}
}

// ── Request interceptor: inject in-memory token ────────────────────────
api.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`
  config._startTime = Date.now()

  logDebug({
    type: 'request',
    method: config.method?.toUpperCase() || 'GET',
    url: config.url,
    params: config.params,
    body: config.data
      ? (() => { try { return JSON.parse(JSON.stringify(config.data)) } catch { return '[unparseable]' } })()
      : undefined,
  })

  return config
})

// ── Response interceptor: 401 → silent refresh → replay ───────────────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  )
  failedQueue = []
}

api.interceptors.response.use(
  (response) => {
    logDebug({
      type: 'response',
      method: response.config.method?.toUpperCase() || 'GET',
      url: response.config.url,
      status: response.status,
      duration: response.config._startTime ? `${Date.now() - response.config._startTime}ms` : null,
      data: response.data,
    })
    return response
  },
  async (error) => {
    logDebug({
      type: 'error',
      method: error.config?.method?.toUpperCase() || 'GET',
      url: error.config?.url,
      status: error.response?.status,
      duration: error.config?._startTime ? `${Date.now() - error.config._startTime}ms` : null,
      data: error.response?.data,
      message: error.message,
    })

    const originalRequest = error.config

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return api(originalRequest)
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, {
        refresh_token: refreshToken,
      })

      const { access_token, refresh_token } = data.session

      // New access token → memory only
      _accessToken = access_token
      // Rotate refresh token in localStorage
      localStorage.setItem(REFRESH_KEY, refresh_token)

      processQueue(null, access_token)
      originalRequest.headers.Authorization = `Bearer ${access_token}`
      return api(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      clearTokens()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
