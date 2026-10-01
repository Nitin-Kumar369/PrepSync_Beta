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

      <aside className={`fixed md:static left-0 top-0 h-full w-72 bg-slate-50 border-r border-slate-200 p-4 transform transition-transform md:translate-x-0 z-30 flex flex-col ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex justify-between items-center mb-5 px-1">
          <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500">Conversations</h2>
          <button 
            onClick={onClose}
            className="md:hidden p-1 text-slate-500 hover:text-slate-800 bg-white rounded-lg border border-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <button 
          onClick={() => {
            onSelectChat(null)
            onClose()
          }}
          className="w-full mb-5 py-2.5 px-4 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm text-slate-800 font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-sm"
        >
          <Plus className="w-4 h-4 text-blue-600" /> New Chat
        </button>

        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
          {loading && <div className="text-slate-400 text-xs text-center py-4">Loading chats...</div>}
          {error && <div className="text-red-600 text-xs p-2.5 bg-red-50 rounded-xl border border-red-200">{error}</div>}
          {chats.length === 0 && !loading && (
            <div className="text-slate-400 text-xs text-center py-6">No previous conversations</div>
          )}
          
          {chats.map(chat => {
            const isSelected = currentChatId === chat.chat_id
            return (
              <div
                key={chat.chat_id}
                onClick={() => {
                  onSelectChat(chat.chat_id)
                  onClose()
                }}
                className={`p-3 rounded-2xl cursor-pointer group transition-all duration-150 border ${
                  isSelected 
                    ? 'bg-blue-50 border-blue-300 shadow-sm' 
                    : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex justify-between items-start gap-2.5">
                  <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold truncate text-sm leading-tight ${isSelected ? 'text-blue-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
                      {chat.title || 'Untitled Chat'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 font-medium">
                      {new Date(chat.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(e, chat.chat_id)}
                    className={`opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all ${
                      isSelected ? 'opacity-100' : ''
                    }`}
                    title="Delete chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200">
          <a 
            href="/browse"
            className="flex items-center justify-center gap-2 p-2.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-2xl text-xs font-semibold text-slate-700 transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Browse Library
          </a>
        </div>
      </aside>
    </>
  )
}