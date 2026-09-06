import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import API from '../store/authStore'
import ChatSidebar from '../components/ChatSidebar'
import Button from '../components/UI/Button'
import { Menu, Send, Loader2, BookOpen, Paperclip, MessageSquare, Info } from 'lucide-react'

export default function Chat() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const bookId = searchParams.get('book_id')
  const sessionId = searchParams.get('session_id')
  const chatId = searchParams.get('chat_id')
  
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentChatId, setCurrentChatId] = useState(chatId || null)
  const [currentSessionId, setCurrentSessionId] = useState(sessionId || null)
  const [bookInfo, setBookInfo] = useState(null)
  const [sources, setSources] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState(null)
  
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  useEffect(() => {
    if (bookId) {
      API.get(`/books/${bookId}`)
        .then(res => setBookInfo(res.data))
        .catch(err => console.error('Failed to fetch book:', err))
    }
  }, [bookId])

  useEffect(() => {
    if (currentChatId) {
      API.get(`/chat/${currentChatId}`)
        .then(res => {
          setMessages(res.data.messages || [])
        })
        .catch(err => {
          setError('Failed to load chat: ' + (err.response?.data?.detail || err.message))
        })
    } else if (currentChatId === null && bookId) {
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
      
      if (res.data.chat_id && !currentChatId) setCurrentChatId(res.data.chat_id)
      if (res.data.session_id && !currentSessionId) setCurrentSessionId(res.data.session_id)
      
      setMessages(prev => [
        ...prev,
        { role: 'user', content: query, timestamp: new Date().toISOString(), sources: [] },
        { role: 'assistant', content: res.data.response, timestamp: new Date().toISOString(), sources: res.data.sources || [] }
      ])
      
      setSources(res.data.sources || [])
      setQuery('')
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Failed to query')
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
    <div className="flex h-[calc(100vh-64px)] bg-white overflow-hidden">
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
      
      <div className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 p-4 z-10 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {bookInfo ? bookInfo.title : 'Global Chat'}
              </h1>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleNewChat}
                className="text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 shadow-none rounded-full px-5"
              >
                New Chat
              </Button>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {messages.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="bg-slate-50 p-4 rounded-3xl text-slate-400 mb-6 border border-slate-100">
                 <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">No active chat</h2>
              <p className="text-slate-500 font-medium leading-relaxed">
                {bookInfo ? 'Start a conversation about this book by typing below.' : 'Select a book from the library to begin chatting.'}
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8 pb-8">
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-8">
                   {msg.role === 'user' ? (
                     <div className="flex justify-end">
                       <div className="max-w-[85%] sm:max-w-[75%] bg-slate-100 text-slate-800 rounded-3xl rounded-tr-sm px-6 py-4">
                         <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{msg.content}</div>
                       </div>
                     </div>
                   ) : (
                     <div className="flex justify-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-1 border border-blue-200 shadow-sm">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="max-w-[90%] sm:max-w-[85%]">
                          <p className="text-[15px] text-slate-800 leading-relaxed break-words whitespace-pre-wrap mb-3">{msg.content}</p>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[13px] text-slate-500">
                              <div className="font-semibold mb-2 flex items-center gap-1"><Paperclip className="w-3 h-3"/> References</div>
                              <div className="space-y-1.5">
                                {msg.sources.map((src, sIdx) => (
                                  <div key={sIdx} className="flex gap-2">
                                     <span className="shrink-0 text-slate-300">•</span>
                                     <span><span className="font-medium text-slate-700">{src.book_name}</span> {src.page_range && `(Page ${src.page_range})`}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                     </div>
                   )}
                </div>
              ))}
              {loading && (
                 <div className='flex justify-start gap-4'>
                 <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 mt-1 border border-slate-200">
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

        {/* Input Area */}
        <div className="bg-white pb-6 pt-2 px-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            {error && (
              <div className='mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-sm font-medium'>
                {error}
              </div>
            )}
            
            {!bookId && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-100 text-yellow-800 rounded-2xl text-[14px] font-medium text-center flex items-center justify-center gap-2">
                <Info className="w-4 h-4"/> Please select a book from the browse page to start chatting.
              </div>
            )}

            <div className={`bg-slate-50 rounded-3xl border p-2 flex flex-col sm:flex-row gap-2 transition-all ${bookId ? 'border-slate-200 focus-within:bg-white focus-within:shadow-md focus-within:border-slate-300' : 'border-slate-100 opacity-50'}`}>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter' && !e.shiftKey && bookId) { 
                    e.preventDefault()
                    sendQuery()
                  } 
                }}
                placeholder={bookInfo ? "Ask about this book..." : "Select a book to start..."}
                disabled={!bookId || loading}
                className="flex-1 p-4 bg-transparent focus:outline-none resize-none text-slate-800 placeholder-slate-400 text-[15px] disabled:bg-transparent"
                rows={1}
              />
              <div className="flex items-end justify-end p-1">
                <Button 
                  onClick={sendQuery}
                  disabled={loading || !bookId || !query.trim()}
                  className={`rounded-full w-12 h-12 p-0 flex items-center justify-center transition-all ${
                    query.trim() && !loading && bookId ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm' : 'bg-slate-200 text-slate-400'
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