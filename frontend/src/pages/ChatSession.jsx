import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import AssessmentCard from '../components/AssessmentCard'
import VisualCard from '../components/VisualCard'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import { useChatStore } from '../store/chatStore'
import {
  Menu, ChevronDown, ChevronUp, Send, Loader2, BookOpen, MessageSquare,
  Award, Sparkles, SlidersHorizontal, GitBranch, BookMarked
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
  const [sourcesOpenByMsg, setSourcesOpenByMsg] = useState({})

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

  // Visual Engine States
  const [visualLoading, setVisualLoading] = useState(false)
  const [showVisualModal, setShowVisualModal] = useState(false)
  const [visualPrompt, setVisualPrompt] = useState('')
  const [visualPreference, setVisualPreference] = useState('auto')

  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, visualLoading])

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
      const processed = rawMessages.map(m => {
        if (m.role === 'assessment' || m.role === 'visual') {
          return { ...m, isExpanded: false }
        }
        return m
      })
      setMessages(processed)
      setSourcesOpenByMsg({})
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
        if (m.role === 'assessment' || m.role === 'visual') {
          return { ...m, isExpanded: false }
        }
        return m
      })
      setMessages(processed)
      setSourcesOpenByMsg({})
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

  const ensureActiveChatId = async () => {
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
    return activeCid
  }

  const launchQuiz = async (options = {}) => {
    setShowConfigModal(false)
    setQuizLoading(true)
    setError(null)
    try {
      const activeCid = await ensureActiveChatId()
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
      setRefreshSidebar(prev => prev + 1)
    } catch (e) {
      setError('Failed to generate in-chat quiz.')
    } finally {
      setQuizLoading(false)
    }
  }

  const launchVisual = async (options = {}) => {
    const promptToSend = options.query !== undefined ? options.query : visualPrompt
    const prefToSend = options.visual_preference || visualPreference

    setShowVisualModal(false)
    setVisualPrompt('')
    setVisualLoading(true)
    setError(null)

    try {
      const activeCid = await ensureActiveChatId()

      const payload = {
        book_id: bookId,
        chat_id: activeCid,
        query: promptToSend,
        mode: options.mode || 'query',
        visual_preference: prefToSend,
        context_text: options.contextText || null
      }

      const res = await API.post('/visual/generate', payload)

      if (res.data?.refused) {
        const refusalMsg =
          res.data.refusal_message ||
          'This visual request falls outside the scope of this book.'

        setMessages(prev => {
          const next = [...prev]
          if (options.mode === 'query' && promptToSend) {
            next.push({
              role: 'user',
              content: promptToSend,
              timestamp: new Date().toISOString()
            })
          }
          next.push({
            role: 'assistant',
            content: refusalMsg,
            timestamp: new Date().toISOString(),
            sources: []
          })
          return next
        })
        setRefreshSidebar(prev => prev + 1)
        return
      }

      const newVisualItem = {
        role: 'visual',
        visual_id: res.data.visual_id,
        mode: res.data.mode,
        visual: res.data.visual,
        isExpanded: true,
        timestamp: new Date().toISOString()
      }

      setMessages(prev => [...prev, newVisualItem])
      setRefreshSidebar(prev => prev + 1)
    } catch (e) {
      setError('Failed to generate visual diagram/chart.')
    } finally {
      setVisualLoading(false)
    }
  }

  const openVisualModal = () => {
    if (query.trim()) {
      setVisualPrompt(query.trim())
      setQuery('')
    }
    setShowVisualModal(true)
  }

  const sendQuery = async (customQuery = null) => {
    const textToSend = (customQuery || query).trim()
    if (!textToSend || !book) return

    if (/^\/(diagram|graph|chart|packet|sequence|layers)\b/i.test(textToSend)) {
      const cmd = textToSend.match(/^\/(\w+)/i)[1].toLowerCase()
      const prefMap = { graph: 'chart', chart: 'chart', packet: 'packet', sequence: 'sequence', layers: 'layers', diagram: 'auto' }
      const stripped = textToSend.replace(/^\/\w+\s*/i, '').trim()
      setQuery('')
      await launchVisual({ mode: 'query', query: stripped, visual_preference: prefMap[cmd] || 'auto' })
      return
    }

    setLoading(true)
    try {
      let sessionId = currentSessionId
      if (!sessionId && !currentChatId) {
        sessionId = await startNewSession(bookId)
        fetchSessions(bookId)
      }

      const payload = {
        query: textToSend,
        book_id: bookId,
        chat_id: currentChatId || undefined,
        session_id: sessionId || undefined
      }

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
            className="px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 break-all"
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <div className="my-3 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm max-w-full">
          <pre className="p-3 sm:p-3.5 overflow-x-auto text-xs font-mono text-slate-800 leading-relaxed">
            <code {...props}>{children}</code>
          </pre>
        </div>
      )
    },
    table: ({node, ...props}) => (
      <div className="overflow-x-auto my-5 rounded-2xl border border-slate-200 shadow-sm max-w-full">
        <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm" {...props} />
      </div>
    ),
    thead: ({node, ...props}) => <thead className="bg-slate-50" {...props} />,
    tbody: ({node, ...props}) => <tbody className="divide-y divide-slate-200 bg-white" {...props} />,
    tr: ({node, ...props}) => <tr className="transition-colors hover:bg-slate-50/70" {...props} />,
    th: ({node, ...props}) => <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left font-bold" {...props} />,
    td: ({node, ...props}) => <td className="px-3 sm:px-4 py-2.5 sm:py-3 align-top text-slate-700" {...props} />,
  }

  const formatPageOnly = (pageRange) => {
    if (!pageRange) return '—'
    const clean = String(pageRange).trim()
    if (!clean || clean === '?-?' || clean === 'None-None') return '—'
    const parts = clean.split('-')
    if (parts.length === 2 && parts[0] === parts[1]) {
      return `p. ${parts[0]}`
    }
    return `pp. ${clean}`
  }

  const formatScoreFloat = (score) => {
    const numeric = Number(score)
    if (!Number.isFinite(numeric)) return '0.00'
    return numeric.toFixed(2)
  }

  if (!book) {
    return (
      <div className="min-h-[calc(100dvh-64px)] bg-white flex items-center justify-center p-4">
        <div className="text-center p-6 sm:p-8 rounded-3xl border border-slate-200 bg-white max-w-sm w-full">
          {error ? (
            <>
              <p className="text-red-600 mb-6 font-medium text-sm">{error}</p>
              <Button onClick={() => navigate('/browse')} className="rounded-full">Browse Books</Button>
            </>
          ) : (
            <>
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
              <p className="mt-4 text-slate-500 font-medium text-sm">Preparing library...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-[calc(100dvh-64px)] w-full max-w-full bg-white overflow-x-clip overflow-y-hidden'>
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={handleSelectChat}
        currentChatId={currentChatId}
        bookId={bookId}
        refreshTrigger={refreshSidebar}
      />

      <div className='flex-1 min-w-0 flex flex-col h-full relative bg-white'>
        {/* Top Header */}
        <div className='bg-white border-b border-slate-200 px-3 py-2.5 sm:p-4 z-10 flex-shrink-0'>
          <div className='flex items-center justify-between gap-2 max-w-4xl mx-auto'>
            <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors md:hidden shrink-0"
                aria-label="Toggle chats"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className='text-sm sm:text-lg font-bold text-slate-900 truncate'>
                  {book.title}
                </h1>
                <p className='text-[11px] sm:text-xs font-semibold text-slate-500 truncate'>
                  {book.department}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {/* Chapter Quiz Trigger */}
              <button
                type="button"
                onClick={() => launchQuiz({
                  mode: 'topic',
                  topic: book?.subject || 'Core Concepts',
                  num_questions: configParams.num_questions,
                  difficulty: configParams.difficulty,
                  question_type: configParams.question_type
                })}
                disabled={quizLoading}
                title="Chapter Quiz"
                className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-full text-xs transition border border-blue-200 shadow-xs"
              >
                <Award className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="hidden sm:inline">{quizLoading ? 'Preparing...' : 'Chapter Quiz'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="p-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-full shadow-xs transition-colors"
                title="Configure custom exam"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowBookSelector(!showBookSelector)
                    if (!availableBooks.length) fetchBooks()
                  }}
                  className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1 border border-slate-200 shadow-xs whitespace-nowrap"
                >
                  <span>Book</span>
                  <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400"/>
                </button>

                {showBookSelector && (
                  <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto">
                    {availableBooks.length > 0 ? (
                      availableBooks.map(b => {
                        const isCurrent = b.book_id === bookId
                        return (
                          <button
                            key={b.book_id}
                            type="button"
                            onClick={() => handleSelectBook(b)}
                            className={`block w-full text-left px-4 py-3 transition-colors border-b border-slate-100 dark:border-[#333333] last:border-b-0 ${
                              isCurrent
                                ? 'bg-blue-50/80 dark:bg-[#007acc]/20 hover:bg-blue-100/70 dark:hover:bg-[#007acc]/30'
                                : 'hover:bg-slate-50 dark:hover:bg-[#2a2d2e]'
                            }`}
                          >
                            <div className={`font-semibold text-sm truncate ${
                              isCurrent ? 'text-blue-600 dark:text-[#4daafc]' : 'text-slate-800 dark:text-[#cccccc]'
                            }`}>
                              {b.title}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-[#888888] mt-0.5 truncate">
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
        <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 sm:p-6 bg-white'>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto px-2">
              <div className="bg-blue-50 p-4 rounded-3xl text-blue-600 mb-5 border border-blue-100">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">How can I help?</h2>
              <p className="text-sm sm:text-base text-slate-500 font-medium leading-relaxed">
                Ask a question about <span className="text-slate-900 font-bold">{book.title}</span>, or use the{' '}
                <span className="text-indigo-600 font-semibold">Visualize</span> button in the input bar to generate flowcharts, packet headers, stacks, or graphs.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-4 min-w-0">
              {messages.map((item, i) => {
                if (item.role === 'assessment') {
                  return (
                    <div key={item.assessment_id || i} className="min-w-0 max-w-full">
                      <AssessmentCard
                        quiz={item}
                        bookId={bookId}
                        initialExpanded={item.isExpanded ?? false}
                        onAskFollowup={(remediationPrompt) => sendQuery(remediationPrompt)}
                        onRetest={() => launchQuiz({
                          mode: item.mode || 'topic',
                          topic: item.topic || book?.subject || 'Core Concepts',
                          num_questions: configParams.num_questions,
                          difficulty: configParams.difficulty,
                          question_type: configParams.question_type
                        })}
                      />
                    </div>
                  )
                }

                if (item.role === 'visual') {
                  return (
                    <div key={item.visual_id || i} className="min-w-0 max-w-full">
                      <VisualCard
                        item={item}
                        initialExpanded={item.isExpanded ?? false}
                        onAskAboutNode={(label) => sendQuery(`Explain "${label}" in detail with an example.`)}
                        onRegenerate={() => launchVisual({
                          mode: item.mode || 'query',
                          query: item.visual?.title || '',
                          visual_preference: item.visual?.kind || 'auto'
                        })}
                      />
                    </div>
                  )
                }

                const isSourcesOpen = !!sourcesOpenByMsg[i]

                return (
                  <div key={i} className="space-y-3 min-w-0 max-w-full">
                    {item.role === 'user' && (
                      <div className="flex justify-end min-w-0">
                        <div className="max-w-[88%] sm:max-w-[75%] min-w-0 bg-blue-600 text-white rounded-3xl rounded-tr-sm px-4 py-3 sm:px-6 sm:py-3.5 shadow-xs">
                          <p className="text-sm sm:text-[15px] leading-relaxed break-words font-medium">{item.content}</p>
                        </div>
                      </div>
                    )}

                    {item.role === 'assistant' && (
                      <div className="space-y-2 min-w-0 max-w-full">
                        <div className="flex justify-start items-start gap-2.5 sm:gap-4 min-w-0">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0 text-slate-800 text-sm sm:text-[15px] leading-relaxed break-words overflow-hidden">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={MarkdownComponents}
                            >
                              {item.content}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {/* Collapsible Sources (Closed by Default): Page | Score */}
                        {item.sources && item.sources.length > 0 && (
                          <div className="pl-10 sm:pl-12 pt-1 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                setSourcesOpenByMsg(prev => ({
                                  ...prev,
                                  [i]: !prev[i]
                                }))
                              }
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                            >
                              <BookMarked className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>Sources ({item.sources.length})</span>
                              {isSourcesOpen ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {isSourcesOpen && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {item.sources.map((src, sIdx) => (
                                  <span
                                    key={src.chunk_id || sIdx}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-[#333333] text-[11px] font-mono text-slate-700 dark:text-slate-300"
                                  >
                                    <span>{formatPageOnly(src.page_range)}</span>
                                    <span className="text-slate-400">|</span>
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                      {formatScoreFloat(src.relevance_score)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Inline Action Chips */}
                        <div className="flex flex-wrap justify-start gap-2 pl-10 sm:pl-12">
                          <button
                            type="button"
                            onClick={() => launchQuiz({
                              mode: 'post_response',
                              topic: book?.subject || '',
                              contextText: item.content,
                              num_questions: configParams.num_questions,
                              difficulty: configParams.difficulty,
                              question_type: configParams.question_type
                            })}
                            disabled={quizLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold rounded-full text-xs transition shadow-xs"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>Quiz me on this</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => launchVisual({
                              mode: 'post_response',
                              query: 'Visualize this explanation clearly',
                              contextText: item.content,
                              visual_preference: 'auto'
                            })}
                            disabled={visualLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold rounded-full text-xs transition shadow-xs"
                          >
                            <GitBranch className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>Visualize this</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {(loading || visualLoading) && (
                <div className='flex justify-start items-center gap-3 sm:gap-4'>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                  <div className='text-xs sm:text-[14px] text-slate-500 font-medium'>
                    {visualLoading ? 'Generating interactive visual...' : 'Analyzing textbook...'}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="bg-white pb-4 pt-2.5 px-3 sm:pb-6 sm:pt-3 sm:px-4 flex-shrink-0 border-t border-slate-200">
          <div className="max-w-3xl mx-auto">
            {error && (
              <div className='mb-2.5 p-2.5 sm:p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs sm:text-sm font-medium'>
                {error}
              </div>
            )}
            <div className="bg-slate-50 rounded-3xl border border-slate-200 p-1.5 sm:p-2 flex items-end gap-1.5 sm:gap-2 transition-all shadow-xs focus-within:bg-white focus-within:border-blue-500">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about this book..."
                className="flex-1 min-w-0 px-3 py-2.5 sm:p-3 bg-transparent focus:outline-none resize-none text-slate-900 placeholder-slate-400 text-sm sm:text-[15px]"
                rows={1}
                disabled={loading || visualLoading}
              />
              <div className="flex items-center gap-1 sm:gap-1.5 p-0.5 sm:p-1 shrink-0">
                <button
                  type="button"
                  onClick={openVisualModal}
                  disabled={loading || visualLoading}
                  title="Generate diagram, packet header, stack, or graph"
                  aria-label="Visualize"
                  className="h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-full flex items-center gap-1.5 bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#3a3a3a] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 text-xs font-semibold transition-all shadow-2xs disabled:opacity-40"
                >
                  <GitBranch className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Visualize</span>
                </button>

                <Button
                  type="button"
                  onClick={() => sendQuery()}
                  disabled={loading || visualLoading || !query.trim()}
                  aria-label="Send message"
                  className={`rounded-full w-10 h-10 sm:w-11 sm:h-11 p-0 flex items-center justify-center transition-all shrink-0 ${
                    query.trim() && !loading && !visualLoading ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {loading || visualLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin"/> : <Send className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />}
                </Button>
              </div>
            </div>
            <div className="text-center mt-2">
              <span className="text-[11px] font-medium text-slate-400">AI responses are generated directly from indexed textbook materials.</span>
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
                  type="button"
                  onClick={() => setConfigParams(p => ({ ...p, num_questions: count }))}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    configParams.num_questions === count
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
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
                  type="button"
                  onClick={() => setConfigParams(p => ({ ...p, difficulty: tier.id }))}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    configParams.difficulty === tier.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowConfigModal(false)} className="rounded-full text-xs px-5">
              Cancel
            </Button>
            <Button
              type="button"
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

      {/* Modal for Visual Generator */}
      <Modal
        isOpen={showVisualModal}
        onClose={() => setShowVisualModal(false)}
        title="Generate Visual"
        size="md"
      >
        <div className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 text-xs uppercase tracking-wider">
              What should I visualize?
            </label>
            <textarea
              value={visualPrompt}
              onChange={(e) => setVisualPrompt(e.target.value)}
              rows={3}
              placeholder="e.g., IPv6 datagram header, TCP 3-way handshake, OSI 7 layers, or Big-O growth curves..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-sm resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Leave blank to visualize the current chat discussion automatically.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 text-xs uppercase tracking-wider">
              Visual Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'auto', label: 'Auto Select' },
                { id: 'packet', label: 'Header / Bits' },
                { id: 'diagram', label: 'Flow / Block' },
                { id: 'sequence', label: 'Sequence' },
                { id: 'layers', label: 'Layered Stack' },
                { id: 'chart', label: 'Data / Graph' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVisualPreference(opt.id)}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all ${
                    visualPreference === opt.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowVisualModal(false)} className="rounded-full text-xs px-5">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => launchVisual({
                mode: 'query',
                query: visualPrompt,
                visual_preference: visualPreference
              })}
              className="rounded-full text-xs px-6 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Generate Visual
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}