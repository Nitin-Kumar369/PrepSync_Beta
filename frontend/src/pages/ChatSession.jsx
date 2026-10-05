import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import AssessmentCard from '../components/AssessmentCard'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import { useChatStore } from '../store/chatStore'
import { 
  Menu, ChevronDown, Send, Loader2, BookOpen, MessageSquare, 
  Award, Sparkles, SlidersHorizontal 
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import 'katex/dist/katex.min.css'

export default function ChatSession() {
  const { bookId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryChatId = searchParams.get('chat_id')
  const querySessionId = searchParams.get('session_id')

  const navigate = useNavigate()
  const location = useLocation()
  const bookFromState = location.state?.book
  const prefilledQuery = location.state?.prefilledQuery

  const [book, setBook] = useState(bookFromState || null)
  const { setCurrentBook, addMessage } = useChatStore()
  
  const [query, setQuery] = useState(prefilledQuery || '')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const [currentChatId, setCurrentChatId] = useState(queryChatId || null)
  const [showBookSelector, setShowBookSelector] = useState(false)
  const [availableBooks, setAvailableBooks] = useState([])
  const [refreshSidebar, setRefreshSidebar] = useState(0)

  const { currentSessionId, setCurrentSessionId, startNewSession, fetchSessions } = useChatStore()

  // Assessment Engine States
  const [quizLoading, setQuizLoading] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configParams, setConfigParams] = useState({
    num_questions: 5,
    difficulty: 'intermediate',
    question_type: 'single_choice'
  })

  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  // Sync state if URL search parameters update
  useEffect(() => {
    const urlCid = searchParams.get('chat_id')
    if (urlCid !== currentChatId) {
      setCurrentChatId(urlCid || null)
    }
  }, [searchParams])

  useEffect(() => {
    if (!book && bookId) {
      fetchBookDetails()
    }
    if (book) {
      setCurrentBook(book, book.department, book.year_of_study, book.subject)
    }
  }, [bookId, book, setCurrentBook])

  const fetchBookDetails = async () => {
    try {
      const res = await API.get(`/books/${bookId}`)
      setBook(res.data)
    } catch (e) {
      setError('Failed to fetch book details')
    }
  }

  // Load chat items when chat_id or session_id changes
  useEffect(() => {
    if (currentChatId && bookId) {
      fetchChatHistory(currentChatId)
    } else if (querySessionId && bookId && !currentChatId) {
      fetchSessionHistory(querySessionId)
    } else if (!currentChatId && !querySessionId) {
      setMessages([])
      setCurrentSessionId(null)
    }
  }, [currentChatId, querySessionId, bookId])

  const fetchChatHistory = async (cid) => {
    if (!cid || !bookId) return
    setLoading(true)
    setError(null)
    try {
      const res = await API.get(`/chat/${bookId}/chats/${cid}`)
      const rawMessages = res.data.messages || []
      // Historic assessments collapsed by default
      const processed = rawMessages.map(m => {
        if (m.role === 'assessment') {
          return { ...m, isExpanded: false }
        }
        return m
      })
      setMessages(processed)
    } catch (e) {
      setError('Failed to load chat: ' + (e.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  const fetchSessionHistory = async (sid) => {
    if (!sid || !bookId) return
    setLoading(true)
    setError(null)
    try {
      const res = await API.get(`/chat/${bookId}/sessions/${sid}`)
      const rawMessages = res.data.messages || []
      const processed = rawMessages.map(m => {
        if (m.role === 'assessment') {
          return { ...m, isExpanded: false }
        }
        return m
      })
      setMessages(processed)
      setCurrentSessionId(sid)
    } catch (e) {
      console.error('Failed to load session from URL:', e)
    } finally {
      setLoading(false)
    }
  }

  const fetchBooks = async () => {
    try {
      const res = await API.get('/books/all')
      setAvailableBooks(res.data.books || [])
    } catch (e) {
      console.error(e)
    }
  }

  const handleSelectBook = (selectedBook) => {
    if (selectedBook.book_id === bookId) return
    navigate(`/chat/${selectedBook.book_id}`, { state: { book: selectedBook } })
    setShowBookSelector(false)
  }

  const handleSelectChat = (chatId) => {
    setCurrentChatId(chatId)
    if (chatId) {
      setSearchParams({ chat_id: chatId })
    } else {
      setSearchParams({})
      setMessages([])
      setCurrentSessionId(null)
    }
  }

  // --- Centralized launchQuiz Handler ---
  const launchQuiz = async (options = {}) => {
    setQuizLoading(true)
    setError(null)
    try {
      let activeCid = currentChatId
      if (!activeCid) {
        let sid = currentSessionId
        if (!sid) {
          sid = await startNewSession(bookId)
          fetchSessions(bookId)
        }
        activeCid = sid
        setCurrentChatId(activeCid)
        setSearchParams({ chat_id: activeCid })
      }

      // Determine robust topic: explicit topic passed > book subject > fallback
      const chosenTopic = options.topic || book?.subject || 'Core Concepts'

      const payload = {
        book_id: bookId,
        chat_id: activeCid,
        session_id: currentSessionId,
        mode: options.mode || 'topic',
        topic: chosenTopic,
        context_text: options.contextText || null,
        num_questions: options.num_questions !== undefined ? options.num_questions : configParams.num_questions,
        difficulty: options.difficulty || configParams.difficulty,
        question_type: options.question_type || configParams.question_type
      }

      const res = await API.post('/assessment/generate', payload)
      
      // Append fresh test in expanded state into the chat stream
      const newAssessmentItem = {
        role: 'assessment',
        assessment_id: res.data.assessment_id,
        topic: res.data.topic || chosenTopic,
        difficulty: res.data.difficulty,
        mode: res.data.mode,
        questions: res.data.questions,
        completed: false,
        result: null,
        isExpanded: true,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, newAssessmentItem])
      setShowConfigModal(false)
      setRefreshSidebar(prev => prev + 1)
    } catch (e) {
      setError('Failed to generate in-chat quiz.')
    } finally {
      setQuizLoading(false)
    }
  }

  const sendQuery = async (customQuery = null) => {
    const textToSend = customQuery || query
    if (!textToSend.trim() || !book) return
    setLoading(true)
    try {
      let sessionId = currentSessionId
      if (!sessionId && !currentChatId) {
        sessionId = await startNewSession(bookId)
        fetchSessions(bookId)
      }

      const payload = {
        query: textToSend.trim(),
        book_id: bookId,
        chat_id: currentChatId || undefined,
        session_id: sessionId || undefined
      }

      // Collect chat history, skipping assessment cards
      const recent = []
      messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .forEach(m => {
          recent.push({ role: m.role, content: m.content })
        })
      if (recent.length) payload.previous_messages = recent

      const res = await API.post(`/chat/${bookId}`, payload)

      let isNew = false
      if (res.data.chat_id && res.data.chat_id !== currentChatId) {
        setCurrentChatId(res.data.chat_id)
        setSearchParams({ chat_id: res.data.chat_id })
        isNew = true
      }
      if (res.data.session_id && !currentSessionId) {
        setCurrentSessionId(res.data.session_id)
        isNew = true
      }
      if (isNew) {
        setRefreshSidebar(prev => prev + 1)
      }

      const userMsg = {
        role: 'user',
        content: textToSend,
        timestamp: new Date().toISOString()
      }
      const assistantMsg = {
        role: 'assistant',
        content: res.data.response,
        timestamp: new Date().toISOString(),
        sources: res.data.sources || []
      }

      setMessages(prev => [...prev, userMsg, assistantMsg])
      addMessage(textToSend, res.data.response)
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
      const isInline = !String(children).includes('\n') && !className?.includes('language-')
      if (isInline) {
        return (
          <code 
            className="px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200" 
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <div className="my-3 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
          <pre className="p-3.5 overflow-x-auto text-xs font-mono text-slate-800 leading-relaxed">
            <code {...props}>{children}</code>
          </pre>
        </div>
      )
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
        onSelectChat={handleSelectChat}
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

            <div className="flex items-center gap-2 sm:gap-3">
              {/* TRIGGER 1: Top Header "Chapter Quiz" */}
              <button
                onClick={() => launchQuiz({ 
                  mode: 'topic',
                  topic: book?.subject || 'Core Concepts',
                  num_questions: configParams.num_questions,
                  difficulty: configParams.difficulty,
                  question_type: configParams.question_type
                })}
                disabled={quizLoading}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-full text-xs transition border border-blue-200 shadow-sm"
              >
                <Award className="w-4 h-4 text-blue-600" />
                <span>{quizLoading ? 'Preparing...' : 'Chapter Quiz'}</span>
              </button>

              <button
                onClick={() => setShowConfigModal(true)}
                className="p-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-full shadow-sm transition-colors"
                title="Configure custom exam"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

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
        </div>

        {/* Message Stream */}
        <div className='flex-1 overflow-y-auto p-4 md:p-6 bg-white space-y-6'>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="bg-blue-50 p-4 rounded-3xl text-blue-600 mb-6 border border-blue-100">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">How can I help?</h2>
              <p className="text-slate-500 font-medium leading-relaxed">
                Ask a question about <span className="text-slate-900 font-bold">{book.title}</span>. When ready, click <span className="font-semibold text-blue-600">Quiz me on this response</span> to test your understanding.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-8">
              {messages.map((item, i) => {
                // Assessment Card within chat
                if (item.role === 'assessment') {
                  return (
                    <AssessmentCard
                      key={item.assessment_id || i}
                      quiz={item}
                      bookId={bookId}
                      initialExpanded={item.isExpanded ?? false}
                      onAskFollowup={(remediationPrompt) => {
                        sendQuery(remediationPrompt)
                      }}
                      /* TRIGGER 2: Retake Test on an existing assessment card */
                      onRetest={() => launchQuiz({ 
                        mode: item.mode || 'topic', 
                        topic: item.topic || book?.subject || 'Core Concepts',
                        num_questions: configParams.num_questions,
                        difficulty: configParams.difficulty,
                        question_type: configParams.question_type
                      })}
                    />
                  )
                }

                // Regular User / Assistant Messages
                return (
                  <div key={i} className="space-y-4">
                    {item.role === 'user' && (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] sm:max-w-[75%] bg-blue-600 text-white rounded-3xl rounded-tr-sm px-6 py-3.5 shadow-sm">
                          <p className="text-[15px] leading-relaxed break-words font-medium">{item.content}</p>
                        </div>
                      </div>
                    )}

                    {item.role === 'assistant' && (
                      <div className="space-y-2">
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
                              {item.content}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {/* TRIGGER 3: Inline "Quiz me on this response" Chip */}
                        <div className="flex justify-start pl-13">
                          <button
                            onClick={() => launchQuiz({
                              mode: 'post_response',
                              topic: book?.subject || '',
                              contextText: item.content,
                              num_questions: configParams.num_questions,
                              difficulty: configParams.difficulty,
                              question_type: configParams.question_type
                            })}
                            disabled={quizLoading}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold rounded-full text-xs transition shadow-sm"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span>Quiz me on this response</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

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
                  onClick={() => sendQuery()} 
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

      {/* Modal for Custom Exam Configurator */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Custom Exam Configurator"
        size="md"
      >
        <div className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 text-xs uppercase tracking-wider">Number of Questions</label>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 10].map(count => (
                <button
                  key={count}
                  onClick={() => setConfigParams(p => ({ ...p, num_questions: count }))}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    configParams.num_questions === count 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {count} Questions
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 text-xs uppercase tracking-wider">Difficulty Tier</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'foundational', label: 'Foundational' },
                { id: 'intermediate', label: 'Intermediate' },
                { id: 'exam_level', label: 'Exam / GATE' }
              ].map(tier => (
                <button
                  key={tier.id}
                  onClick={() => setConfigParams(p => ({ ...p, difficulty: tier.id }))}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    configParams.difficulty === tier.id 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowConfigModal(false)} className="rounded-full text-xs px-5">
              Cancel
            </Button>
            <Button 
              onClick={() => launchQuiz({
                mode: 'custom',
                topic: book?.subject || 'Custom Exam',
                num_questions: configParams.num_questions,
                difficulty: configParams.difficulty,
                question_type: configParams.question_type
              })} 
              className="rounded-full text-xs px-6 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Launch Test
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}