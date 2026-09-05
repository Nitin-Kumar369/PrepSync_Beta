import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import Button from '../components/UI/Button'
import { useChatStore } from '../store/chatStore'

export default function ChatSession() {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const bookFromState = location.state?.book

  const [book, setBook] = useState(bookFromState || null)
  const { setCurrentBook, addMessage, clearMessages } = useChatStore()
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentChatId, setCurrentChatId] = useState(null)
  const [showBookSelector, setShowBookSelector] = useState(false)
  const [availableBooks, setAvailableBooks] = useState([])
  const { currentSessionId, setCurrentSessionId, startNewSession, fetchSessions } = useChatStore()

  useEffect(() => {
    if (!book && bookId) {
      fetchBookDetails()
    }
    // if we already have a book (from state) ensure store is synced
    if (book) {
      setCurrentBook(book, book.department, book.year_of_study, book.subject)
    }
  }, [bookId, book, setCurrentBook])

  // Load chat history when a chat is selected from sidebar
  useEffect(() => {
    if (currentChatId && bookId) {
      fetchChatHistory()
    } else if (!currentChatId) {
      // New chat: clear history
      setHistory([])
      setResponse(null)
      setQuery('')
    }
  }, [currentChatId, bookId])

  const fetchChatHistory = async () => {
    if (!currentChatId || !bookId) return
    try {
      const res = await API.get(`/chat/${bookId}/chats/${currentChatId}`)
      // Handle backend message format (role/content based)
      const backendMessages = res.data.messages || []
      
      // Convert role-based messages to query-response pairs
      const formattedHistory = []
      for (let i = 0; i < backendMessages.length; i++) {
        const msg = backendMessages[i]
        if (msg.role === 'user' && i + 1 < backendMessages.length && backendMessages[i + 1].role === 'assistant') {
          formattedHistory.push({
            query: msg.content,
            response: backendMessages[i + 1].content,
            timestamp: msg.timestamp
          })
          i++ // Skip the assistant message since we paired it
        }
      }
      
      setHistory(formattedHistory)
      setError(null)
    } catch (e) {
      setError('Failed to load chat: ' + (e.response?.data?.detail || e.message))
      console.error('Failed to load chat:', e)
    }
  }

  // Load available books for dropdown
  const fetchBooks = async () => {
    try {
      const res = await API.get('/books/departments')
      const depts = res.data.departments || []
      const booksForAll = []
      for (const dept of depts) {
        const booksRes = await API.get(`/books/by_department/${dept}`)
        booksForAll.push(...(booksRes.data.books || []))
      }
      setAvailableBooks(booksForAll)
    } catch (e) {
      console.error('Failed to fetch books:', e)
    }
  }

  const handleSelectBook = (selectedBook) => {
    if (selectedBook.book_code === bookId) return
    navigate(`/chat/${selectedBook.book_code}`, { state: { book: selectedBook } })
    setShowBookSelector(false)
  }

  const fetchBookDetails = async () => {
    try {
      const res = await API.get(`/books/${bookId}`)
      setBook(res.data)
    } catch (e) {
      setError('Failed to fetch book details')
      console.error(e)
    }
  }

  const sendQuery = async () => {
    if (!query.trim() || !book) return

    setLoading(true)
    try {
      // ensure a session exists for this conversation
      let sessionId = currentSessionId
      if (!sessionId) {
        sessionId = await startNewSession(bookId)
        // refresh sidebar sessions after creating a new one
        fetchSessions(bookId)
      }

      const payload = {
        query: query.trim(),
        book_id: bookId
      }
      if (sessionId) {
        payload.session_id = sessionId
      }
      // include recent chat history for better context (last 3 messages)
      try {
        const recent = history.slice(-3).map(h => ({ role: h.response ? 'assistant' : 'user', content: h.response || h.query || '' }))
        if (recent.length) payload.previous_messages = recent
      } catch (e) {
        // ignore and proceed without previous messages
      }

      const res = await API.post(`/chat/${bookId}`, payload)

      // if server provided session_id (e.g. auto-created), sync it
      if (res.data.session_id && !currentSessionId) {
        setCurrentSessionId(res.data.session_id)
      }

      // if server provided chat_id (new chat created), sync it
      if (res.data.chat_id && !currentChatId) {
        setCurrentChatId(res.data.chat_id)
      }

      const newMessage = {
        query: query,
        response: res.data.response,
        book_id: bookId,
        timestamp: new Date().toISOString()
      }

      setHistory([...history, newMessage])
      addMessage(query, res.data.response)

      setResponse(res.data)
      setQuery('')
      setError(null)
    } catch (e) {
      setError('Failed to get response: ' + (e.response?.data?.detail || e.message))
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuery()
    }
  }

  const handleSelectSession = (session) => {
    // Load session chat history
    if (session.messages) {
      setHistory(session.messages)
    }
    if (session.session_id) {
      setCurrentSessionId(session.session_id)
    }
  }

  const handleNewChat = () => {
    setHistory([])
    setResponse(null)
    setQuery('')
    clearMessages()
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {error ? (
            <>
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={() => navigate('/browse')}>Browse Books</Button>
            </>
          ) : (
            <>
              <div className="inline-block h-8 w-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 muted">Loading book...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-screen bg-gray-50'>
      {/* Sidebar */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={(chatId) => {
          setCurrentChatId(chatId)
          setSidebarOpen(false)
        }}
        currentChatId={currentChatId}
        bookId={bookId}
      />

      {/* Main Chat Area */}
      <div className='flex-1 flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='bg-white border-b border-gray-200 p-4 shadow-sm'>
          {/* Breadcrumb */}
          {book && (
            <div className='mb-4 text-sm'>
              <Link to='/' className='text-accent hover:underline'>Home</Link>
              <span className='mx-2 muted'>/</span>
              <Link to={`/department/${encodeURIComponent(book.department)}`} className='text-accent hover:underline'>
                {book.department}
              </Link>
              <span className='mx-2 muted'>/</span>
              <span className='muted'>{book.title}</span>
            </div>
          )}
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-gray-200 rounded"
              >
                Menu
              </button>
              <div>
                <h1 className='text-2xl font-bold'>{book.title}</h1>
                <p className='text-sm text-gray-600'>
                  {book.department} • {book.year_of_study} • {book.subject}
                </p>
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setShowBookSelector(!showBookSelector)
                  if (!availableBooks.length) fetchBooks()
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition"
              >
                Change Book ▼
              </button>
              {showBookSelector && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  {availableBooks.length > 0 ? (
                    availableBooks.map(b => (
                      <button
                        key={b.book_code}
                        onClick={() => handleSelectBook(b)}
                        className={`block w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-200 last:border-b-0 ${
                          b.book_code === bookId ? 'bg-blue-100 font-semibold' : ''
                        }`}
                      >
                        <div className="font-medium text-sm">{b.title}</div>
                        <div className="text-xs text-gray-600">{b.department} • {b.year_of_study}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-gray-500 text-sm">Loading books...</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat History */}
        <div className='flex-1 overflow-y-auto p-6 space-y-4'>
          {history.length === 0 && !response ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <h2 className="text-xl font-semibold mb-2">Start a Conversation</h2>
                <p className="muted">
                  Ask questions about {book.title} and get AI-powered answers based on the book content.
                </p>
              </div>
            </div>
          ) : (
            <>
              {history.map((msg, i) => (
                <div key={i} className="space-y-3">
                  {/* User Message */}
                  {msg.query && (
                    <div className="flex justify-end">
                      <div className="max-w-sm bg-blue-600 text-white rounded-lg p-4 rounded-br-none shadow">
                        <p className="text-sm break-words">{msg.query}</p>
                      </div>
                    </div>
                  )}

                  {/* Bot Response */}
                  {msg.response && (
                    <div className="flex justify-start">
                      <div className="max-w-sm bg-gray-200 text-gray-900 p-4 rounded-lg rounded-bl-none shadow">
                        <p className="text-sm break-words whitespace-pre-wrap">{msg.response}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {loading && (
            <div className='flex justify-center'>
              <div className='bg-gray-200 text-gray-800 rounded-lg p-4'>
                <div className='flex items-center gap-2'>
                  <div className='h-4 w-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin'></div>
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className='mx-6 mb-4 p-3 bg-red-100 text-red-700 rounded-lg'>
            {error}
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question about this book... (Shift+Enter for new line)"
              className="flex-1 p-3 border rounded focus:outline-none focus:border-accent resize-none"
              rows={3}
              disabled={loading}
            />
            <Button onClick={sendQuery} disabled={loading || !query.trim()}>
              {loading ? '⏳' : '📤'} Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
