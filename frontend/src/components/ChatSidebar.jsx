import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import { Plus, X, MessageSquare, Trash2, ArrowLeft } from 'lucide-react'

export default function ChatSidebar({ isOpen, onClose, onSelectChat, currentChatId, bookId, refreshTrigger }) {
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (bookId) {
      const isDesktop = window.innerWidth >= 768
      if (isDesktop || isOpen) {
        fetchChats()
      }
    }
  }, [isOpen, bookId, refreshTrigger])

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
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 md:hidden z-20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div className={`fixed md:static left-0 top-0 h-full w-72 bg-slate-50/50 border-r border-slate-200 p-4 transform transition-transform md:translate-x-0 z-30 flex flex-col ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex justify-between items-center mb-6 px-1">
          <h2 className="text-sm font-bold tracking-wider uppercase text-slate-500">Conversations</h2>
          <button 
            onClick={onClose}
            className="md:hidden p-1 text-slate-400 hover:text-slate-700 bg-white rounded-lg border border-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <button 
          onClick={() => {
            onSelectChat(null)
            onClose()
          }}
          className="w-full mb-6 py-3 px-4 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-sm hover:text-blue-700 rounded-2xl text-slate-700 font-semibold transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Chat
        </button>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {loading && <div className="text-slate-400 text-sm text-center py-4">Loading...</div>}
          {error && <div className="text-red-500 text-sm p-3 bg-red-50 rounded-xl border border-red-100">{error}</div>}
          {chats.length === 0 && !loading && (
            <div className="text-slate-400 text-sm text-center py-4">No recent chats</div>
          )}
          
          {chats.map(chat => (
            <div
              key={chat.chat_id}
              onClick={() => {
                onSelectChat(chat.chat_id)
                onClose()
              }}
              className={`p-3 rounded-2xl cursor-pointer group transition-all duration-200 border ${
                currentChatId === chat.chat_id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${currentChatId === chat.chat_id ? 'text-blue-600' : 'text-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold truncate text-sm leading-tight ${currentChatId === chat.chat_id ? 'text-blue-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
                    {chat.title || 'Untitled Chat'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-medium">
                    {new Date(chat.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(e, chat.chat_id)}
                  className={`opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all ${
                    currentChatId === chat.chat_id ? 'opacity-100' : ''
                  }`}
                  title="Delete chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200/60">
          <a 
            href="/browse"
            className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-2xl text-sm font-semibold text-slate-700 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Browse Library
          </a>
        </div>
      </div>
    </>
  )
}