import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import Button from '../components/UI/Button'
import { useChatStore } from '../store/chatStore'
import { Menu, ChevronDown, Send, Loader2, BookOpen, MessageSquare } from 'lucide-react'

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
  const { setCurrentBook, addMessage } = useChatStore()
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

  const MarkdownComponents = {
    p: ({node, ...props}) => <p className="mb-3.5 last:mb-0 leading-relaxed" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3.5 space-y-1.5" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3.5 space-y-1.5" {...props} />,
    li: ({node, ...props}) => <li className="pl-1 leading-relaxed" {...props} />,
    h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-4" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2.5 mt-4" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2 mt-3" {...props} />,
    h4: ({node, ...props}) => <h4 className="text-sm font-bold mb-1.5 mt-2.5" {...props} />,
    strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
    em: ({node, ...props}) => <em className="italic" {...props} />,
    hr: ({node, ...props}) => <hr className="my-4 border-slate-200" {...props} />,
    code: ({ node, className, children, ...props }) => {
  // A code element is inline if it is directly inside an inline element, or does not contain newlines
  const isInline = !String(children).includes('\n') && !className?.includes('language-');

  if (isInline) {
    return (
      <code 
        className="px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
      <pre className="p-3.5 overflow-x-auto text-xs font-mono text-slate-800 leading-relaxed">
        <code {...props}>{children}</code>
      </pre>
    </div>
  );
},
    table: ({node, ...props}) => (
      <div className="overflow-x-auto my-5 rounded-2xl border border-slate-200 shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm" {...props} />
      </div>
    ),
    thead: ({node, ...props}) => <thead className="bg-slate-50" {...props} />,
    tbody: ({node, ...props}) => <tbody className="divide-y divide-slate-200 bg-white" {...props} />,
    tr: ({node, ...props}) => <tr className="transition-colors hover:bg-slate-50/70" {...props} />,
    th: ({node, ...props}) => <th className="px-4 py-3 text-left font-bold" {...props} />,
    td: ({node, ...props}) => <td className="px-4 py-3 align-top text-slate-700" {...props} />,
  }

  if (!book) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-white flex items-center justify-center">
        <div className="text-center p-8 rounded-3xl border border-slate-200 bg-white">
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
    <div className='flex h-[calc(100vh-64px)] bg-white overflow-hidden'>
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

      <div className='flex-1 flex flex-col h-full relative bg-white'>
        {/* Top Header */}
        <div className='bg-white border-b border-slate-200 p-4 z-10 flex-shrink-0'>
          <div className='flex items-center justify-between max-w-4xl mx-auto'>
            <div className='flex items-center gap-3'>
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className='text-base md:text-lg font-bold text-slate-900 flex items-center gap-2'>
                  {book.title}
                </h1>
                <p className='text-xs font-semibold text-slate-500 mt-0.5'>
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
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-full text-sm font-semibold transition flex items-center gap-2 border border-slate-200 shadow-sm"
              >
                Change Book <ChevronDown className="w-4 h-4 text-slate-400"/>
              </button>
              {showBookSelector && (
  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto">
    {availableBooks.length > 0 ? (
      availableBooks.map(b => {
        const isCurrent = b.book_id === bookId
        return (
          <button
            key={b.book_id}
            onClick={() => handleSelectBook(b)}
            className={`block w-full text-left px-5 py-3.5 transition-colors border-b border-slate-100 dark:border-[#333333] last:border-b-0 ${
              isCurrent 
                ? 'bg-blue-50/80 dark:bg-[#007acc]/20 hover:bg-blue-100/70 dark:hover:bg-[#007acc]/30' 
                : 'hover:bg-slate-50 dark:hover:bg-[#2a2d2e]'
            }`}
          >
            <div className={`font-semibold text-sm ${
              isCurrent ? 'text-blue-600 dark:text-[#4daafc]' : 'text-slate-800 dark:text-[#cccccc]'
            }`}>
              {b.title}
            </div>
            <div className="text-xs text-slate-400 dark:text-[#888888] mt-0.5">
              {b.department}
            </div>
          </button>
        )
      })
    ) : (
      <div className="px-4 py-6 text-slate-400 text-sm text-center flex flex-col items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin"/> Loading library
      </div>
    )}
  </div>
)}
            </div>
          </div>
        </div>

        {/* Message Stream */}
        <div className='flex-1 overflow-y-auto p-4 md:p-6 bg-white'>
          {history.length === 0 && !response ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="bg-blue-50 p-4 rounded-3xl text-blue-600 mb-6 border border-blue-100">
                 <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">How can I help?</h2>
              <p className="text-slate-500 font-medium leading-relaxed">
                Ask a question about <span className="text-slate-900 font-bold">{book.title}</span>. I will provide answers grounded directly in the textbook.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8 pb-8">
              {history.map((msg, i) => (
                <div key={i} className="space-y-6">
                  {/* User Question */}
                  {msg.query && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[75%] bg-blue-600 text-white rounded-3xl rounded-tr-sm px-6 py-3.5 shadow-sm">
                        <p className="text-[15px] leading-relaxed break-words font-medium">{msg.query}</p>
                      </div>
                    </div>
                  )}

                  {/* Assistant Answer */}
                  {msg.response && (
                    <div className="flex justify-start items-start gap-4">
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="max-w-[90%] sm:max-w-[85%] text-slate-800 text-[15px] leading-relaxed break-words">
                        <ReactMarkdown 
                          remarkPlugins={[remarkMath, remarkGfm]} 
                          rehypePlugins={[rehypeKatex]}
                          components={MarkdownComponents}
                        >
                          {msg.response}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {loading && (
                <div className='flex justify-start items-center gap-4'>
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                  <div className='text-[14px] text-slate-500 font-medium'>
                    Analyzing textbook...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="bg-white pb-6 pt-3 px-4 flex-shrink-0 border-t border-slate-200">
          <div className="max-w-3xl mx-auto">
            {error && (
              <div className='mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-medium'>
                {error}
              </div>
            )}
            <div className="bg-slate-50 rounded-3xl border border-slate-200 p-2 flex flex-col sm:flex-row gap-2 transition-all shadow-sm focus-within:bg-white focus-within:border-blue-500">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about this book..."
                className="flex-1 p-3 bg-transparent focus:outline-none resize-none text-slate-900 placeholder-slate-400 text-[15px]"
                rows={1}
                disabled={loading}
              />
              <div className="flex items-end justify-end p-1">
                <Button 
                  onClick={sendQuery} 
                  disabled={loading || !query.trim()}
                  className={`rounded-full w-11 h-11 p-0 flex items-center justify-center transition-all ${
                    query.trim() && !loading ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5 ml-0.5" />}
                </Button>
              </div>
            </div>
            <div className="text-center mt-2.5">
               <span className="text-xs font-medium text-slate-400">AI responses are generated directly from indexed textbook materials.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}