import { create } from 'zustand'
import axios from 'axios'

const API = axios.create({
  baseURL: '/api'
})

// Add token to Authorization header
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ` + token
  }
  return config
})

/**
 * Chat store for managing book selection, sessions, and conversation state.
 */
export const useChatStore = create((set, get) => ({
  // Book selection
  currentBook: null,
  currentDepartment: null,
  currentYear: null,
  currentSubject: null,

  // Sessions
  sessions: [],
  currentSessionId: null,

  // Conversation
  messages: [],
  isLoading: false,
  error: null,

  // Actions
  setCurrentBook: (book, department, year, subject) => {
    set({ 
      currentBook: book,
      currentDepartment: department,
      currentYear: year,
      currentSubject: subject,
      messages: [],
      currentSessionId: null
    })
  },

  addMessage: (query, response) => {
    const state = get()
    const newMessage = {
      query,
      response,
      timestamp: new Date().toISOString(),
      book_id: state.currentBook?.book_id
    }
    set({ messages: [...state.messages, newMessage] })
  },

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  clearMessages: () => set({ messages: [], currentSessionId: null }),

  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId })
  },

  startNewSession: async (bookId) => {
    try {
      set({ isLoading: true })
      const res = await API.post(`/chat/${bookId}/sessions`, {
        title: `New Chat - ${new Date().toLocaleDateString()}`
      })
      const sessionId = res.data.session_id
      set({ 
        currentSessionId: sessionId, 
        messages: [],
        isLoading: false
      })
      return sessionId
    } catch (err) {
      set({ 
        error: err.response?.data?.detail || 'Failed to create session',
        isLoading: false 
      })
      return null
    }
  },

  loadSession: async (sessionId, bookId) => {
    try {
      set({ isLoading: true })
      const res = await API.get(`/chat/${bookId}/sessions/${sessionId}`)
      set({ 
        messages: res.data.messages || [],
        currentSessionId: sessionId,
        isLoading: false
      })
    } catch (err) {
      set({ 
        error: err.response?.data?.detail || 'Failed to load session',
        isLoading: false 
      })
    }
  },

  fetchSessions: async (bookId) => {
    try {
      set({ isLoading: true })
      const url = `/chat/${bookId}/sessions`
      const res = await API.get(url)
      set({ 
        sessions: res.data,
        isLoading: false
      })
    } catch (err) {
      set({ 
        error: err.response?.data?.detail || 'Failed to fetch sessions',
        isLoading: false 
      })
    }
  },

  deleteSession: async (sessionId, bookId) => {
    try {
      await API.delete(`/chat/${bookId}/sessions/${sessionId}`)
      const state = get()
      set({ 
        sessions: state.sessions.filter(s => s.session_id !== sessionId)
      })
      if (state.currentSessionId === sessionId) {
        set({ currentSessionId: null, messages: [] })
      }
    } catch (err) {
      set({ 
        error: err.response?.data?.detail || 'Failed to delete session'
      })
    }
  },

  switchBook: (book, department, year, subject) => {
    set({
      currentBook: book,
      currentDepartment: department,
      currentYear: year,
      currentSubject: subject,
      messages: [],
      currentSessionId: null,
      sessions: []
    })
  },

  init: () => {
    // Initialize from localStorage if needed
    const savedBook = localStorage.getItem('currentBook')
    if (savedBook) {
      try {
        const book = JSON.parse(savedBook)
        set({ currentBook: book })
      } catch (e) {
        console.warn('Failed to load current book from localStorage', e)
      }
    }
  }
}))

export default API
