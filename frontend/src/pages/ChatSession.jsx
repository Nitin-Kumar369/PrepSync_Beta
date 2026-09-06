import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import Button from '../components/UI/Button'
import { useChatStore } from '../store/chatStore'
import { Menu, ChevronDown, Send, Loader2, BookOpen, MessageSquare } from 'lucide-react'

// --- Markdown & LaTeX Imports ---
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import 'katex/dist/katex.min.css'

export default function ChatSession() {
  const { bookId } = useParams()
  const [searchParams] = useSearchParams()
  const querySessionId = searchParams.get('session_id')
  
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
  const [refreshSidebar, setRefreshSidebar] = useState(0)
  
  const { currentSessionId, setCurrentSessionId, startNewSession, fetchSessions } = useChatStore()
  
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [history, loading])

  useEffect(() => {
    if (!book && bookId) {
      fetchBookDetails()
    }
    if (book) {
      setCurrentBook(book, book.department, book.year_of_study, book.subject)
    }
  }, [bookId, book, setCurrentBook])

  useEffect(() => {
    if (querySessionId && bookId && !currentChatId) {
      fetchSessionHistory(querySessionId)
    }
  }, [querySessionId, bookId, currentChatId])

  const fetchSessionHistory = async (sid) => {
    try {
      const res = await API.get(`/chat/${bookId}/sessions/${sid}`)
      const backendMessages = res.data.messages || []
      
      const formattedHistory = []
      for (let i = 0; i < backendMessages.length; i++) {
        const msg = backendMessages[i]
        if (msg.role === 'user' && i + 1 < backendMessages.length && backendMessages[i + 1].role === 'assistant') {
          formattedHistory.push({
            query: msg.content,
            response: backendMessages[i + 1].content,
            timestamp: msg.timestamp
          })
          i++ 
        }
      }
      
      setHistory(formattedHistory)
      setCurrentSessionId(sid)
    } catch (e) {
      console.error('Failed to load session from URL:', e)
    }
  }

  useEffect(() => {
    if (currentChatId && bookId) {
      fetchChatHistory()
    } else if (!currentChatId && !querySessionId) {
      setHistory([])
      setResponse(null)
      setQuery('')
      setCurrentSessionId(null)
    }
  }, [currentChatId, bookId, querySessionId, setCurrentSessionId])

  const fetchChatHistory = async () => {
    if (!currentChatId || !bookId) return
    try {
      const res = await API.get(`/chat/${bookId}/chats/${currentChatId}`)
      const backendMessages = res.data.messages || []
      
      const formattedHistory = []
      for (let i = 0; i < backendMessages.length; i++) {
        const msg = backendMessages[i]
        if (msg.role === 'user' && i + 1 < backendMessages.length && backendMessages[i + 1].role === 'assistant') {
          formattedHistory.push({
            query: msg.content,
            response: backendMessages[i + 1].content,
            timestamp: msg.timestamp
          })
          i++
        }
      }
      
      setHistory(formattedHistory)
      setError(null)
    } catch (e) {
      setError('Failed to load chat: ' + (e.response?.data?.detail || e.message))
    }
  }

  const fetchBooks = async () => {
    try {
      const res = await API.get('/books/all')
      setAvailableBooks(res.data.books || [])
    } catch (e) {
      console.error('Failed to fetch books:', e)
    }
  }

  const handleSelectBook = (selectedBook) => {
    if (selectedBook.book_id === bookId) return
    navigate(`/chat/${selectedBook.book_id}`, { state: { book: selectedBook } })
    setShowBookSelector(false)
  }

  const fetchBookDetails = async () => {
    try {
      const res = await API.get(`/books/${bookId}`)
      setBook(res.data)
    } catch (e) {
      setError('Failed to fetch book details')
    }
  }

  const sendQuery = async () => {
    if (!query.trim() || !book) return

    setLoading(true)
    try {
      let sessionId = currentSessionId
      if (!sessionId) {
        sessionId = await startNewSession(bookId)
        fetchSessions(bookId)
      }

      const payload = {
        query: query.trim(),
        book_id: bookId
      }
      if (sessionId) {
        payload.session_id = sessionId
      }
      
      try {
        const recent = []
        history.slice(-3).forEach(h => {
          if (h.query) recent.push({ role: 'user', content: h.query })
          if (h.response) recent.push({ role: 'assistant', content: h.response })
        })
        if (recent.length) payload.previous_messages = recent
      } catch (e) {}

      const res = await API.post(`/chat/${bookId}`, payload)

      let isNewChat = false
      if (res.data.session_id && !currentSessionId) {
        setCurrentSessionId(res.data.session_id)
        isNewChat = true
      }
      if (res.data.chat_id && !currentChatId) {
        setCurrentChatId(res.data.chat_id)
        isNewChat = true
      }
      
      if (isNewChat) {
        setRefreshSidebar(prev => prev + 1)
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

  // Common Markdown Components configuration with Table Support
  const MarkdownComponents = {
    p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
    li: ({node, ...props}) => <li className="pl-1" {...props} />,
    h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-4" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2 mt-4" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2 mt-3" {...props} />,
    strong: ({node, ...props}) => <strong className="font-semibold text-slate-900 dark:text-slate-100" {...props} />,
    code: ({node, inline, ...props}) => 
      inline 
        ? <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm font-mono text-blue-600 dark:text-blue-400" {...props} />
        : <div className="my-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"><pre className="p-4 overflow-x-auto text-sm font-mono"><code {...props} /></pre></div>,
    table: ({node, ...props}) => <div className="overflow-x-auto my-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"><table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm" {...props} /></div>,
    thead: ({node, ...props}) => <thead className="bg-slate-50 dark:bg-slate-800/50" {...props} />,
    tbody: ({node, ...props}) => <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-transparent" {...props} />,
    tr: ({node, ...props}) => <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50" {...props} />,
    th: ({node, ...props}) => <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-100" {...props} />,
    td: ({node, ...props}) => <td className="px-4 py-3 text-slate-700 dark:text-slate-300 align-top" {...props} />,
  }

  if (!book) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-white dark:bg-transparent flex items-center justify-center">
        <div className="text-center bg-white dark:bg-transparent p-8 rounded-3xl">
          {error ? (
            <>
              <p className="text-red-600 mb-6 font-medium">{error}</p>
              <Button onClick={() => navigate('/browse')} className="rounded-full">Browse Books</Button>
            </>
          ) : (
            <>
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
              <p className="mt-4 text-slate-500 font-medium">Preparing library...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-[calc(100vh-64px)] bg-white dark:bg-transparent overflow-hidden'>
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={(chatId) => {
          setCurrentChatId(chatId)
          setSidebarOpen(false)
        }}
        currentChatId={currentChatId}
        bookId={bookId}
        refreshTrigger={refreshSidebar}
      />

      <div className='flex-1 flex flex-col h-full relative'>
        <div className='bg-white/80 dark:bg-[#1e1e1e]/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 p-4 z-10 flex-shrink-0'>
          <div className='flex items-center justify-between max-w-4xl mx-auto'>
            <div className='flex items-center gap-3'>
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className='text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2'>
                  {book.title}
                </h1>
                <p className='text-xs font-medium text-slate-400 mt-0.5'>
                  {book.department}
                </p>
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setShowBookSelector(!showBookSelector)
                  if (!availableBooks.length) fetchBooks()
                }}
                className="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full text-sm font-semibold transition flex items-center gap-2 border border-slate-200 dark:border-slate-700"
              >
                Change Book <ChevronDown className="w-4 h-4 text-slate-400"/>
              </button>
              {showBookSelector && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-xl z-50 max-h-80 overflow-y-auto">
                  {availableBooks.length > 0 ? (
                    availableBooks.map(b => (
                      <button
                        key={b.book_id}
                        onClick={() => handleSelectBook(b)}
                        className={`block w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800 last:border-b-0 ${
                          b.book_id === bookId ? 'bg-slate-50 dark:bg-slate-800' : ''
                        }`}
                      >
                        <div className={`font-semibold text-sm ${b.book_id === bookId ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {b.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{b.department}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-slate-500 text-sm text-center flex flex-col items-center gap-2">
                       <Loader2 className="w-4 h-4 animate-spin"/> Loading library
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto p-4 md:p-6'>
          {history.length === 0 && !response ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-3xl text-blue-600 dark:text-blue-400 mb-6">
                 <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">How can I help?</h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                Ask a question about <span className="text-slate-800 dark:text-slate-200 font-bold">{book.title}</span>. I'll provide an answer grounded purely in the textbook's content.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8 pb-8">
              {history.map((msg, i) => (
                <div key={i} className="space-y-8">
                  {msg.query && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[75%] bg-blue-600 dark:bg-blue-600 text-white rounded-3xl rounded-tr-sm px-6 py-4 shadow-sm">
                        <p className="text-[15px] leading-relaxed break-words">{msg.query}</p>
                      </div>
                    </div>
                  )}

                  {msg.response && (
                    <div className="flex justify-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-1 border border-blue-200 dark:border-blue-800 shadow-sm">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="max-w-[90%] sm:max-w-[85%] bg-white dark:bg-transparent rounded-2xl p-2 text-slate-800 dark:text-slate-300 w-full overflow-hidden">
                        {/* Markdown Renderer with remarkGfm for Tables */}
                        <div className="text-[15px] leading-relaxed break-words markdown-body">
                          <ReactMarkdown 
                            remarkPlugins={[remarkMath, remarkGfm]} 
                            rehypePlugins={[rehypeKatex]}
                            components={MarkdownComponents}
                          >
                            {msg.response}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {loading && (
                <div className='flex justify-start gap-4'>
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0 mt-1 border border-slate-200 dark:border-slate-700">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                  <div className='text-[15px] text-slate-400 font-medium py-1.5'>
                    Analyzing textbook...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-transparent pb-6 pt-2 px-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            {error && (
              <div className='mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 text-red-700 dark:text-red-400 rounded-2xl text-sm font-medium'>
                {error}
              </div>
            )}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-2 flex flex-col sm:flex-row gap-2 transition-all focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:shadow-md focus-within:border-slate-300 dark:focus-within:border-slate-600">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about this book..."
                className="flex-1 p-4 bg-transparent focus:outline-none resize-none text-slate-800 dark:text-slate-100 placeholder-slate-400 text-[15px]"
                rows={1}
                disabled={loading}
              />
              <div className="flex items-end justify-end p-1">
                <Button 
                  onClick={sendQuery} 
                  disabled={loading || !query.trim()}
                  className={`rounded-full w-12 h-12 p-0 flex items-center justify-center transition-all ${
                    query.trim() && !loading ? 'bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white shadow-sm' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                  }`}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5 ml-0.5" />}
                </Button>
              </div>
            </div>
            <div className="text-center mt-3">
               <span className="text-[11px] font-medium text-slate-400">AI responses are generated directly from indexed textbook materials.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}