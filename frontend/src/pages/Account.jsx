import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import API from '../store/authStore'
import { Button, Skeleton, Modal } from '../components/UI'
import { 
  User, History, Trash2, Settings, Clock, MessageSquare, Play,
  Target, Award, Flame, BookCheck, BrainCircuit, AlertTriangle, 
  CheckCircle2, XCircle, ArrowUpRight, Sparkles, Tag, ChevronDown, ChevronUp, Eye,
  BookOpen
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

  // Analytics, History & Modal State
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [selectedReviewTest, setSelectedReviewTest] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [expandedSubjects, setExpandedSubjects] = useState({})

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
        full_name: res.data.full_name || '',
        department: res.data.department || '',
        email: res.data.email || '',
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
      if (res.data?.subjects_breakdown?.length > 0) {
        setExpandedSubjects({ [res.data.subjects_breakdown[0].subject]: true })
      }
    } catch (e) {
      console.error('Failed to load student analytics:', e)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const toggleSubjectExpand = (subjName) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [subjName]: !prev[subjName]
    }))
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
      <div className="bg-white dark:bg-[#1e1e1e] min-h-screen py-12">
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
    <div className="bg-white dark:bg-[#1e1e1e] min-h-screen py-12 transition-colors">
      <div className="max-w-5xl mx-auto px-6 space-y-10">
        {/* Header Profile Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#333333] pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 p-3 rounded-2xl">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{profile?.full_name}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{profile?.email} • {profile?.department || 'Student'}</p>
            </div>
          </div>
          <Button
            onClick={() => setEditMode(!editMode)}
            className={`rounded-full px-5 text-sm ${editMode ? 'bg-slate-200 dark:bg-[#333333] text-slate-800 dark:text-slate-200' : 'bg-slate-100 dark:bg-[#252526] text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#2a2d2e]'}`}
          >
            {editMode ? 'Cancel Editing' : 'Edit Profile'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded-2xl text-sm font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-emerald-950/30 border border-green-200 dark:border-emerald-800 text-green-700 dark:text-emerald-400 p-4 rounded-2xl text-sm font-medium">
            {success}
          </div>
        )}

        {/* Profile Settings Form */}
        {editMode && (
          <div className="bg-slate-50 dark:bg-[#252526] rounded-3xl border border-slate-200 dark:border-[#333333] p-8 space-y-5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-500" /> Account Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white dark:bg-[#1e1e1e] border border-slate-300 dark:border-[#333333] rounded-xl text-sm text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Department</label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white dark:bg-[#1e1e1e] border border-slate-300 dark:border-[#333333] rounded-xl text-sm text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white dark:bg-[#1e1e1e] border border-slate-300 dark:border-[#333333] rounded-xl text-sm text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Current Password</label>
                <input
                  type="password"
                  name="current_password"
                  value={formData.current_password}
                  onChange={handleInputChange}
                  placeholder="Required for security changes"
                  className="w-full p-2.5 bg-white dark:bg-[#1e1e1e] border border-slate-300 dark:border-[#333333] rounded-xl text-sm text-slate-800 dark:text-slate-200"
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

        {/* 1. GLOBAL PERFORMANCE COCKPIT */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Global Performance Cockpit
            </h2>
            <span className="text-xs font-medium text-slate-400">All-Subject Diagnostics</span>
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 dark:bg-[#252526] p-5 rounded-2xl border border-slate-200 dark:border-[#333333]">
                <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mastery Index</span>
                  <Award className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analytics?.average_score_percentage || 0}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Overall question accuracy</p>
              </div>
              <div className="bg-slate-50 dark:bg-[#252526] p-5 rounded-2xl border border-slate-200 dark:border-[#333333]">
                <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pass Rate</span>
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analytics?.pass_rate_percentage || 0}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{analytics?.total_tests_taken || 0} tests ({analytics?.total_questions_correct || 0}/{analytics?.total_questions_attempted || 0} correct)</p>
              </div>
              <div className="bg-slate-50 dark:bg-[#252526] p-5 rounded-2xl border border-slate-200 dark:border-[#333333]">
                <div className="flex items-center justify-between text-amber-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Study Streak</span>
                  <Flame className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analytics?.learning_streak_days || 0} Days</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Consistent revision days</p>
              </div>
              <div className="bg-slate-50 dark:bg-[#252526] p-5 rounded-2xl border border-slate-200 dark:border-[#333333]">
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Book Coverage</span>
                  <BookCheck className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analytics?.book_coverage_percentage || 0}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Catalog material explored</p>
              </div>
            </div>
          )}
        </section>

        {/* 2. HIERARCHICAL SUBJECT-WISE KNOWLEDGE MATRIX & ADAPTIVE PLAN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-3xl p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#333333] pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Subject-Wise Knowledge Matrix
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click any subject to view sub-topic diagnostic breakdown</p>
              </div>
            </div>

            {(!analytics?.subjects_breakdown || analytics.subjects_breakdown.length === 0) ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No diagnostic test data available. Take in-chat quizzes to populate your knowledge matrix.
              </div>
            ) : (
              <div className="space-y-4">
                {analytics.subjects_breakdown.map((subj) => {
                  const isExpanded = !!expandedSubjects[subj.subject]

                  return (
                    <div 
                      key={subj.subject} 
                      className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-slate-200 dark:border-[#333333] shadow-sm overflow-hidden transition-all"
                    >
                      {/* Subject Card Header */}
                      <div 
                        onClick={() => toggleSubjectExpand(subj.subject)}
                        className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-[#2a2d2e] transition-colors select-none"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 pr-2">
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            subj.accuracy_percentage >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                            subj.accuracy_percentage >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                            'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                          }`}>
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">{subj.subject}</h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                subj.tier === 'Mastered' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-transparent dark:border-emerald-800/60' :
                                subj.tier === 'Developing' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-transparent dark:border-amber-800/60' :
                                'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-transparent dark:border-red-800/60'
                              }`}>
                                {subj.badge} • {subj.accuracy_percentage}%
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {subj.total_tests_taken} Tests • {subj.total_correct}/{subj.total_questions} Questions ({subj.topics.length} Sub-topics)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24 bg-slate-100 dark:bg-[#333333] rounded-full h-2 overflow-hidden hidden sm:block">
                            <div
                              className={`h-2 rounded-full ${
                                subj.tier === 'Mastered' ? 'bg-emerald-500' :
                                subj.tier === 'Developing' ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.max(subj.accuracy_percentage, 5)}%` }}
                            />
                          </div>
                          <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Sub-Topic Matrix */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-[#333333] bg-slate-50/70 dark:bg-[#171717] p-4 sm:p-5 space-y-3">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">
                            {subj.subject} Sub-Topic Diagnostics
                          </span>

                          {subj.topics.length === 0 ? (
                            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No specific sub-topics recorded yet.</p>
                          ) : (
                            subj.topics.map((item, tIdx) => (
                              <div 
                                key={tIdx} 
                                className="bg-white dark:bg-[#252526] p-3.5 rounded-xl border border-slate-200 dark:border-[#333333] shadow-2xs space-y-2"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{item.topic}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.tier === 'Mastered' 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80' :
                                    item.tier === 'Developing' 
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80' :
                                      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80'
                                  }`}>
                                    {item.badge} • {item.accuracy_percentage}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-[#333333] rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-1.5 rounded-full transition-all duration-500 ${
                                      item.tier === 'Mastered' ? 'bg-emerald-500' :
                                      item.tier === 'Developing' ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.max(item.accuracy_percentage, 5)}%` }}
                                  />
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {item.total_attempts} attempts recorded
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: Adaptive Action Plan */}
          <div className="bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-3xl p-6 sm:p-7 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Adaptive Action Plan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Recommendations categorized by subject weakness</p>
            </div>
            <div className="space-y-3">
              {analytics?.adaptive_recommendations?.map((rec, i) => (
                <div key={i} className="p-3.5 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333333] rounded-2xl shadow-sm text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-800 dark:text-slate-200 truncate">{rec.topic}</span>
                    {rec.status === 'critical' ? (
                      <span className="text-red-600 dark:text-red-400 flex items-center gap-1 text-[10px]"><AlertTriangle className="w-3 h-3" /> Focus</span>
                    ) : (
                      <span className="text-blue-600 dark:text-blue-400 text-[10px]">Recommended</span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{rec.message}</p>
                  <button
                    onClick={() => handleStartReviewChat(analytics?.recent_assessments?.[0]?.book_id, rec.suggested_query)}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 text-[11px] pt-1"
                  >
                    Ask AI: "{rec.suggested_query.slice(0, 32)}..." <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {analytics?.top_explored_tags?.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-[#333333]">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Frequently Explored Terms</span>
                <div className="flex flex-wrap gap-1.5">
                  {analytics.top_explored_tags.map((tag, tIdx) => (
                    <span key={tIdx} className="px-2 py-1 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333333] text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-medium flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5 text-slate-400" /> {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. TEST PERFORMANCE HISTORY (COLLAPSIBLE & SCROLLABLE) */}
        <section className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333333] rounded-3xl p-6 sm:p-8 space-y-4 shadow-sm">
          <div 
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center justify-between border-b border-slate-100 dark:border-[#333333] pb-4 cursor-pointer select-none group"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                <History className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-blue-600" /> Test Performance History
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click any test attempt to view item-by-item question diagnostics</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-[#252526] text-slate-600 dark:text-slate-300 rounded-full">
                {analytics?.recent_assessments?.length || 0} Records
              </span>
              <button className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252526] transition-all">
                {historyOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {historyOpen && (
            <div>
              {analyticsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
                </div>
              ) : (!analytics?.recent_assessments || analytics.recent_assessments.length === 0) ? (
                <div className="text-center py-10 bg-slate-50 dark:bg-[#252526] border border-dashed border-slate-200 dark:border-[#333333] rounded-2xl text-xs text-slate-500 dark:text-slate-400">
                  No assessments recorded yet. Launch a Live Quiz in any chat session to begin tracking progress.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                  {analytics.recent_assessments.map((test, idx) => {
                    const mainTitle = test.subject || test.topic || 'Engineering Subject'
                    const subTitle = (test.subject && test.topic && test.topic !== test.subject) ? test.topic : null

                    return (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedReviewTest(test)}
                        className="p-3.5 bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-2xl hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm flex items-center justify-between cursor-pointer transition-all text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-3">
                          <div className={`p-2 rounded-xl shrink-0 ${
                            test.percentage >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                          }`}>
                            <Award className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate leading-snug">{mainTitle}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-slate-500">
                              {subTitle && (
                                <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold text-[11px] truncate max-w-[200px] border border-transparent dark:border-blue-800/60">
                                  {subTitle}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">
                                {new Date(test.submitted_at).toLocaleDateString()} • {test.total_questions} questions
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{test.score} / {test.total_questions}</span>
                            <p className={`font-semibold text-xs ${test.percentage >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {test.percentage}%
                            </p>
                          </div>
                          <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 4. CHAT HISTORY (CONVERSATION RESUME) */}
        <section className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333333] rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#333333] pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-400" /> Active Textbook Sessions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Resume your recent RAG conversations</p>
            </div>
          </div>
          {chatsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
          ) : chats.length === 0 ? (
            <div className="text-slate-500 dark:text-slate-400 py-10 bg-slate-50 dark:bg-[#252526] rounded-2xl text-center border border-dashed border-slate-200 dark:border-[#333333] text-xs">
              No chat history available.
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {chats.map(chat => (
                <div
                  key={chat.chat_id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-2xl hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all text-xs"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm">{chat.title || 'Untitled Session'}</h4>
                    <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">{chat.last_message || 'Empty conversation'}</p>
                    <span className="text-[10px] text-slate-400 mt-1 inline-block">
                      {new Date(chat.updated_at || chat.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to={chat.book_id ? `/chat/${chat.book_id}?chat_id=${chat.chat_id}` : `/browse`}
                      className="px-4 py-2 bg-slate-50 dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white hover:border-blue-600 transition-colors flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" /> Resume
                    </Link>
                    <button
                      onClick={() => handleDeleteChat(chat.chat_id)}
                      className="p-2 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 rounded-xl transition-colors"
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

      {/* DIAGNOSTIC REVIEW MODAL */}
      <Modal
        isOpen={!!selectedReviewTest}
        onClose={() => setSelectedReviewTest(null)}
        title={`Diagnostic Review: ${selectedReviewTest?.subject || selectedReviewTest?.topic || 'Assessment'}`}
        size="lg"
      >
        {selectedReviewTest && (
          <div className="space-y-5 text-xs">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#252526] rounded-2xl border border-slate-200 dark:border-[#333333]">
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {selectedReviewTest.subject && <span className="block text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">{selectedReviewTest.subject}</span>}
                  Score: {selectedReviewTest.score} / {selectedReviewTest.total_questions} ({selectedReviewTest.percentage}%)
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">{selectedReviewTest.feedback}</p>
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
                <div key={i} className="p-4 bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-2xl space-y-2 shadow-sm">
                  <div className="flex items-start gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
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
                            isCorrect ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200 font-medium' :
                            isChosen && !isCorrect ? 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/40 dark:border-red-700 dark:text-red-200 font-medium' :
                            'bg-slate-50/50 dark:bg-[#1e1e1e] border-slate-200 dark:border-[#333333] text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {opt} {isCorrect && ' • (Correct)'} {isChosen && !isCorrect && ' • (Your Choice)'}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-2 bg-slate-50 dark:bg-[#1e1e1e] p-3 rounded-xl border border-slate-200 dark:border-[#333333] text-slate-600 dark:text-slate-400 italic">
                    <strong className="text-slate-900 dark:text-slate-200">AI Pedagogical Explanation:</strong> {r.explanation}
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