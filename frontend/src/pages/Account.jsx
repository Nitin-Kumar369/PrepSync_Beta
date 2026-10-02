import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import API from '../store/authStore'
import { Button, Skeleton, Modal } from '../components/UI'
import { 
  User, History, Trash2, Settings, Clock, MessageSquare, Play,
  Target, Award, Flame, BookCheck, BrainCircuit, AlertTriangle, 
  CheckCircle2, XCircle, ArrowUpRight, Sparkles, Tag, ChevronRight, Eye
} from 'lucide-react'

export default function Account() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [formData, setFormData] = useState({
    full_name: '',
    department: '',
    email: '',
    new_password: '',
    current_password: ''
  })

  const [chats, setChats] = useState([])
  const [chatsLoading, setChatsLoading] = useState(false)

  // Analytics & Modal State
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [selectedReviewTest, setSelectedReviewTest] = useState(null)

  useEffect(() => {
    fetchProfile()
    fetchRecentChats()
    fetchAnalytics()
  }, [])

  const fetchProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await API.get('/auth/profile')
      setProfile(res.data)
      setFormData({
        full_name: res.data.full_name,
        department: res.data.department,
        email: res.data.email,
        new_password: '',
        current_password: ''
      })
    } catch (e) {
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentChats = async () => {
    setChatsLoading(true)
    try {
      const res = await API.get('/chat/list')
      setChats(res.data.chats || [])
    } catch (e) {
      console.error('Failed to load chats:', e)
    } finally {
      setChatsLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true)
    try {
      const res = await API.get('/assessment/analytics/student')
      setAnalytics(res.data)
    } catch (e) {
      console.error('Failed to load student analytics:', e)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveProfile = async () => {
    setError(null)
    setSuccess(null)
    try {
      await API.put('/auth/profile', {
        full_name: formData.full_name,
        department: formData.department,
        email: formData.email,
        current_password: formData.current_password,
        new_password: formData.new_password || null
      })
      setSuccess('Profile updated successfully')
      setEditMode(false)
      setFormData(prev => ({ ...prev, current_password: '', new_password: '' }))
      fetchProfile()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update profile')
    }
  }

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm('Delete this chat history?')) return
    try {
      await API.delete(`/chat/${chatId}`)
      setChats(prev => prev.filter(c => c.chat_id !== chatId))
    } catch (e) {
      alert('Failed to delete: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleStartReviewChat = (bookId, queryText) => {
    if (bookId) {
      navigate(`/chat/${bookId}`, { state: { prefilledQuery: queryText } })
    } else {
      navigate('/browse')
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen py-12">
        <div className="max-w-5xl mx-auto px-6 space-y-6">
          <Skeleton className="w-56 h-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-6 space-y-10">

        {/* Header Profile Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-3 rounded-2xl">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{profile?.full_name}</h1>
              <p className="text-slate-500 text-sm">{profile?.email} • {profile?.department || 'Student'}</p>
            </div>
          </div>

          <Button
            onClick={() => setEditMode(!editMode)}
            className={`rounded-full px-5 text-sm ${editMode ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
          >
            {editMode ? 'Cancel Editing' : 'Edit Profile'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-2xl text-sm font-medium">
            {success}
          </div>
        )}

        {/* Profile Settings Form (Expandable) */}
        {editMode && (
          <div className="bg-slate-50 rounded-3xl border border-slate-200 p-8 space-y-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-500" /> Account Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current Password</label>
                <input
                  type="password"
                  name="current_password"
                  value={formData.current_password}
                  onChange={handleInputChange}
                  placeholder="Required for security changes"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800"
                />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 text-sm">
                Save Profile Changes
              </Button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 1. HIGH-LEVEL PERFORMANCE METRICS (KPI ROW)              */}
        {/* ======================================================== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" /> Performance Cockpit
            </h2>
            <span className="text-xs font-medium text-slate-400">Live Course Tracking</span>
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-blue-600 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Mastery Index</span>
                  <Award className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{analytics?.average_score_percentage || 0}%</p>
                <p className="text-xs text-slate-500 mt-1">Weighted assessment accuracy</p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-indigo-600 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pass Rate</span>
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{analytics?.pass_rate_percentage || 0}%</p>
                <p className="text-xs text-slate-500 mt-1">{analytics?.total_tests_taken || 0} tests ({analytics?.total_questions_correct || 0}/{analytics?.total_questions_attempted || 0} correct)</p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-amber-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Study Streak</span>
                  <Flame className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{analytics?.learning_streak_days || 0} Days</p>
                <p className="text-xs text-slate-500 mt-1">Consistent revision days</p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-emerald-600 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Book Coverage</span>
                  <BookCheck className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{analytics?.book_coverage_percentage || 0}%</p>
                <p className="text-xs text-slate-500 mt-1">Catalog material explored</p>
              </div>
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* 2 & 5. DYNAMIC KNOWLEDGE MATRIX & ADAPTIVE NEXT STEPS    */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left: Dynamic Knowledge Matrix */}
          <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-indigo-600" /> Dynamic Knowledge Matrix
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Topic diagnostics categorized by mastery readiness</p>
              </div>
            </div>

            {(!analytics?.topic_breakdown || analytics.topic_breakdown.length === 0) ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No diagnostic test data available. Take in-chat quizzes to populate your knowledge matrix.
              </div>
            ) : (
              <div className="space-y-4">
                {analytics.topic_breakdown.map((item, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 text-sm">{item.topic}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.tier === 'Mastered' ? 'bg-emerald-100 text-emerald-800' :
                        item.tier === 'Developing' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.badge} • {item.accuracy_percentage}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          item.tier === 'Mastered' ? 'bg-emerald-500' :
                          item.tier === 'Developing' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(item.accuracy_percentage, 5)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: AI Adaptive Action Plans */}
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-7 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" /> Adaptive Action Plan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Proactive recommendations grounded in weaknesses</p>
            </div>

            <div className="space-y-3">
              {analytics?.adaptive_recommendations?.map((rec, i) => (
                <div key={i} className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-800 truncate">{rec.topic}</span>
                    {rec.status === 'critical' ? (
                      <span className="text-red-600 flex items-center gap-1 text-[10px]"><AlertTriangle className="w-3 h-3" /> Focus</span>
                    ) : (
                      <span className="text-blue-600 text-[10px]">Recommended</span>
                    )}
                  </div>
                  <p className="text-slate-600 leading-relaxed">{rec.message}</p>
                  <button
                    onClick={() => handleStartReviewChat(analytics?.recent_assessments?.[0]?.book_id, rec.suggested_query)}
                    className="text-blue-600 font-semibold hover:underline flex items-center gap-1 text-[11px] pt-1"
                  >
                    Ask AI: "{rec.suggested_query.slice(0, 32)}..." <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Explored Topic Tags */}
            {analytics?.top_explored_tags?.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Frequently Explored Terms</span>
                <div className="flex flex-wrap gap-1.5">
                  {analytics.top_explored_tags.map((tag, tIdx) => (
                    <span key={tIdx} className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-medium flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5 text-slate-400" /> {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. INTERACTIVE ASSESSMENT HISTORY & DRILL-DOWN MODAL     */}
        {/* ======================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-600" /> Test Performance History
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Click any test attempt to view item-by-item question diagnostics and explanations</p>
            </div>
          </div>

          {(!analytics?.recent_assessments || analytics.recent_assessments.length === 0) ? (
            <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
              No assessments recorded yet. Launch a Live Quiz in any chat session to begin tracking progress.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {analytics.recent_assessments.map((test, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setSelectedReviewTest(test)}
                  className="p-4 bg-white hover:bg-slate-50 flex items-center justify-between cursor-pointer transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${test.percentage >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      <Award className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-slate-900 text-sm truncate">{test.topic}</p>
                      <p className="text-slate-400 mt-0.5">{new Date(test.submitted_at).toLocaleDateString()} • {test.total_questions} questions</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className="font-bold text-slate-900 text-sm">{test.score} / {test.total_questions}</span>
                      <p className={`font-semibold ${test.percentage >= 70 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {test.percentage}%
                      </p>
                    </div>
                    <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* 4. CHAT HISTORY (CONVERSATION RESUME)                    */}
        {/* ======================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-600" /> Active Textbook Sessions
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Resume your recent RAG conversations</p>
            </div>
          </div>

          {chatsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
          ) : chats.length === 0 ? (
            <div className="text-slate-500 py-10 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200 text-xs">
              No chat history available.
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {chats.map(chat => (
                <div
                  key={chat.chat_id}
                  className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all text-xs"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-slate-900 truncate text-sm">{chat.title || 'Untitled Session'}</h4>
                    <p className="text-slate-500 truncate mt-0.5">{chat.last_message || 'Empty conversation'}</p>
                    <span className="text-[10px] text-slate-400 mt-1 inline-block">
                      {new Date(chat.updated_at || chat.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to={chat.book_id ? `/chat/${chat.book_id}?chat_id=${chat.chat_id}` : `/chat/${chat.book_id || ''}?chat_id=${chat.chat_id}`}
                      className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" /> Resume
                    </Link>
                    <button
                      onClick={() => handleDeleteChat(chat.chat_id)}
                      className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                      title="Delete chat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* ======================================================== */}
      {/* 3. DIAGNOSTIC REVIEW MODAL (DRILL-DOWN)                  */}
      {/* ======================================================== */}
      <Modal
        isOpen={!!selectedReviewTest}
        onClose={() => setSelectedReviewTest(null)}
        title={`Diagnostic Review: ${selectedReviewTest?.topic || 'Assessment'}`}
        size="lg"
      >
        {selectedReviewTest && (
          <div className="space-y-5 text-xs">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div>
                <p className="font-bold text-slate-900 text-sm">
                  Score: {selectedReviewTest.score} / {selectedReviewTest.total_questions} ({selectedReviewTest.percentage}%)
                </p>
                <p className="text-slate-500 mt-0.5">{selectedReviewTest.feedback}</p>
              </div>
              <Button
                onClick={() => {
                  const bId = selectedReviewTest.book_id
                  setSelectedReviewTest(null)
                  navigate(`/chat/${bId}`)
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-1.5 text-xs"
              >
                Retake Topic Quiz
              </Button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              {selectedReviewTest.results?.map((r, i) => (
                <div key={i} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-sm">
                  <div className="flex items-start gap-2 font-bold text-slate-800 text-sm">
                    {r.is_correct ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <span>{i + 1}. {r.question}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {r.options?.map((opt, oIdx) => {
                      const isChosen = r.user_answer === oIdx
                      const isCorrect = r.correct_answer === oIdx
                      return (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded-xl border ${
                            isCorrect ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium' :
                            isChosen && !isCorrect ? 'bg-red-50 border-red-300 text-red-900 font-medium' :
                            'bg-slate-50/50 border-slate-200 text-slate-600'
                          }`}
                        >
                          {opt} {isCorrect && '✓ (Correct)'} {isChosen && !isCorrect && '✗ (Your Choice)'}
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-600 italic">
                    <strong>AI Pedagogical Explanation:</strong> {r.explanation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}