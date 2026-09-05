import { create } from 'zustand'
import axios from 'axios'

const API = axios.create({
  baseURL: '/api'
})

// Add token to Authorization header
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  init: () => {
    const token = localStorage.getItem('access_token')
    const user = localStorage.getItem('user')
    if (token && user) {
      set({ token, user: JSON.parse(user), isInitialized: true })
    } else {
      set({ isInitialized: true })
    }
  },

  signup: async (email, password, fullName, department) => {
    set({ isLoading: true, error: null })
    try {
      const res = await API.post('/auth/signup', {
        email,
        password,
        full_name: fullName,
        department
      })
      const { access_token, ...userData } = res.data
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('user', JSON.stringify(userData))
      set({ token: access_token, user: userData, isLoading: false })
      return true
    } catch (err) {
      const msg = err.response?.data?.detail || 'Signup failed'
      set({ error: msg, isLoading: false })
      return false
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await API.post('/auth/login', { email, password })
      const { access_token, ...userData } = res.data
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('user', JSON.stringify(userData))
      set({ token: access_token, user: userData, isLoading: false })
      return true
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed'
      set({ error: msg, isLoading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },

  setError: (error) => set({ error })
}))

export default API
