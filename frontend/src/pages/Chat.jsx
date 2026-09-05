import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import Button from '../components/UI/Button'

export default function Chat() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  // URL params
  const bookId = searchParams.get('book_id')
  const sessionId = searchParams.get('session_id')
  const chatId = searchParams.get('chat_id')
  
  // State
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentChatId, setCurrentChatId] = useState(chatId || null)
  const [currentSessionId, setCurrentSessionId] = useState(sessionId || null)
  const [bookInfo, setBookInfo] = useState(null)
  const [sources, setSources] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState(null)

  // Fetch book info if book_id provided
  useEffect(() => {
    if (bookId) {
      API.get(`/books/${bookId}`)
        .then(res => setBookInfo(res.data))
        .catch(err => console.error('Failed to fetch book:', err))
    }
  }, [bookId])

  // Load existing chat if chat_id provided
  useEffect(() => {
    if (currentChatId) {
      API.get(`/chat/${currentChatId}`)
        .then(res => {
          setMessages(res.data.messages || [])
        })
        .catch(err => {
          setError('Failed to load chat: ' + (err.response?.data?.detail || err.message))
          console.error('Failed to load chat:', err)
        })
    } else if (currentChatId === null && bookId) {
      // New chat started: clear state and prepare for fresh conversation
      setMessages([])
      setSources([])
      setQuery('')
      setError(null)
      setCurrentSessionId(null)
    }
  }, [currentChatId, bookId])

  const sendQuery = async () => {
    if (!query.trim()) return
    if (!bookId) {
      alert('Please select a book first')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const payload = {
        query: query,
        book_id: bookId,
        chat_id: currentChatId,
        session_id: currentSessionId,
        book_filters: {
          department: bookInfo?.department,
          year_of_study: bookInfo?.year_of_study,
          subject: bookInfo?.subject
        }
      }
      
      const res = await API.post(`/chat/${bookId}`, payload)
      
      // Update chat/session IDs from response
      if (res.data.chat_id && !currentChatId) {
        setCurrentChatId(res.data.chat_id)
      }
      if (res.data.session_id && !currentSessionId) {
        setCurrentSessionId(res.data.session_id)
      }
      
      // Add messages to history
      setMessages(prev => [
        ...prev,
        {
          role: 'user',
          content: query,
          timestamp: new Date().toISOString(),
          sources: []
        },
        {
          role: 'assistant',
          content: res.data.response,
          timestamp: new Date().toISOString(),
          sources: res.data.sources || []
        }
      ])
      
      setSources(res.data.sources || [])
      setQuery('')
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Failed to query')
      console.error('Query error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleNewChat = () => {
    setCurrentChatId(null)
    setCurrentSessionId(null)
    setMessages([])
    setSources([])
    setQuery('')
  }

  const handleDeleteChat = async () => {
    if (!currentChatId) return
    if (!window.confirm('Delete this chat?')) return
    
    try {
      await API.delete(`/chat/${currentChatId}`)
      handleNewChat()
    } catch (e) {
      alert('Failed to delete chat: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <ChatSidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={(cid) => {
          setCurrentChatId(cid)
          setSidebarOpen(false)
        }}
        currentChatId={currentChatId}
        bookId={bookId}
      />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b p-4 flex items-center justify-between">
          <div>
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mr-4 p-2 hover:bg-gray-200 rounded"
            >
              Menu
            </button>
            <span className="text-lg font-semibold">
              {bookInfo ? bookInfo.title : 'Chat'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleNewChat}
              className="text-sm bg-blue-500"
            >
              New Chat
            </Button>
            {currentChatId && (
              <Button 
                onClick={handleDeleteChat}
                className="text-sm bg-red-500"
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              {bookInfo ? 'Start a conversation about this book' : 'Select a book to begin chatting'}
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-md p-3 rounded-lg ${
                  msg.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-900'
                }`}>
                  <div className="text-sm">{msg.content}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 text-xs opacity-75">
                      📌 {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 p-3 rounded-lg">
                <div className="text-sm">⏳ Thinking...</div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 p-3 mx-4 rounded">
            {error}
          </div>
        )}

        {/* Sources Panel */}
        {sources.length > 0 && (
          <div className="bg-blue-50 border-t p-3 max-h-32 overflow-y-auto">
            <div className="text-xs font-semibold mb-2">📌 Sources:</div>
            <div className="space-y-1">
              {sources.map((src, idx) => (
                <div key={idx} className="text-xs">
                  <span className="font-medium">{src.book_name}</span> 
                  {src.page_range && <span> (p. {src.page_range})</span>}
                  <span className="text-gray-600"> Score: {src.relevance_score?.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white border-t p-4">
          {!bookId && (
            <div className="text-sm text-yellow-700 mb-2">
              ⚠️ Please select a book from the browse page to start chatting
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && !e.shiftKey && bookId) { 
                  e.preventDefault()
                  sendQuery()
                } 
              }}
              placeholder={bookInfo ? "Ask about this book..." : "Select a book..."}
              disabled={!bookId}
              className="flex-1 p-3 border rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
              rows={3}
            />
            <Button 
              onClick={sendQuery}
              disabled={loading || !bookId}
              className="bg-blue-500"
            >
              {loading ? '...' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
