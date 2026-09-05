import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import Button from './UI/Button'

export default function ChatSidebar({ isOpen, onClose, onSelectChat, currentChatId, bookId }) {
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (bookId) {
      // On desktop (md+), sidebar is always visible, so fetch chats
      // On mobile, only fetch when sidebar is open
      const isDesktop = window.innerWidth >= 768
      if (isDesktop || isOpen) {
        fetchChats()
      }
    }
  }, [isOpen, bookId])

  const fetchChats = async () => {
    if (!bookId) return
    setLoading(true)
    setError(null)
    try {
      const res = await API.get(`/chat/${bookId}/chats`)
      setChats(res.data.chats || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load chats')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation()
    if (!window.confirm('Delete this chat?')) return
    if (!bookId) return
    
    try {
      await API.delete(`/chat/${bookId}/chats/${chatId}`)
      setChats(prev => prev.filter(c => c.chat_id !== chatId))
    } catch (e) {
      alert('Failed to delete: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-20"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static left-0 top-0 h-full w-64 bg-gray-900 text-white p-4 transform transition-transform md:translate-x-0 z-30 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Chats</h2>
          <button 
            onClick={onClose}
            className="md:hidden text-2xl hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* New Chat Button */}
        <button 
          onClick={() => {
            onSelectChat(null)
            onClose()
          }}
          className="w-full mb-4 p-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition"
        >
          + New Chat
        </button>

        {/* Chats List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {loading && <div className="text-gray-400 text-sm">Loading...</div>}
          {error && <div className="text-red-400 text-sm">Error: {error}</div>}
          {chats.length === 0 && !loading && (
            <div className="text-gray-400 text-sm">No chats yet</div>
          )}
          
          {chats.map(chat => (
            <div
              key={chat.chat_id}
              onClick={() => {
                onSelectChat(chat.chat_id)
                onClose()
              }}
              className={`p-3 rounded cursor-pointer group hover:bg-gray-800 transition ${
                currentChatId === chat.chat_id ? 'bg-blue-600' : 'bg-gray-800'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm">
                    {chat.title || 'Untitled Chat'}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {chat.last_message?.substring(0, 50)}...
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(chat.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(e, chat.chat_id)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 ml-2 text-lg"
                  title="Delete chat"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Browse Books Link */}
        <div className="mt-auto pt-4 border-t border-gray-700">
          <a 
            href="/browse-books"
            className="block text-center p-3 bg-gray-800 hover:bg-gray-700 rounded text-sm font-medium transition"
          >
            Browse Books
          </a>
        </div>
      </div>
    </>
  )
}
