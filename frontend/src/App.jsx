import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import NavBar from './components/NavBar'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import DepartmentBooks from './pages/DepartmentBooks'
import BrowseBooks from './pages/BrowseBooks'
import ChatSession from './pages/ChatSession'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import Account from './pages/Account'

function ProtectedRoute({ children }) {
  const { user, isInitialized } = useAuthStore()
  if (!isInitialized) return null
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, isInitialized } = useAuthStore()
  if (!isInitialized) return null
  return user?.role === 'admin' ? children : <Navigate to="/chat" replace />
}

export default function App() {
  const { init } = useAuthStore()
  const { initTheme } = useThemeStore()

  useEffect(() => {
    init()
    initTheme() // Bootstrap Dark Mode
  }, [])

  return (
    <div>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/department/:departmentName" element={<DepartmentBooks />} />
        <Route path="/browse" element={<ProtectedRoute><BrowseBooks /></ProtectedRoute>} />
        <Route path="/chat/:bookId" element={<ProtectedRoute><ChatSession /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}