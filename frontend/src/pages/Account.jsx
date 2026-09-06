import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import API from '../store/authStore'
import Button from '../components/UI/Button'
import { User, History, Trash2, Settings, Clock, MessageSquare, Play } from 'lucide-react'

export default function Account() {
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

  useEffect(() => {
    fetchProfile()
    fetchRecentChats()
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

  // Fetch all chats globally via the list endpoint
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

  if (loading) {
    return (
      <div className="flex justify-center py-32 bg-white min-h-screen">
        <div className="inline-block h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-2xl">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Account</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl mb-6 flex items-center gap-2">
             ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-2xl mb-6 flex items-center gap-2">
             ✅ {success}
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-slate-50 rounded-3xl border border-slate-100 p-8 mb-10">
          <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-500" /> Profile Settings
            </h2>
            <Button
              onClick={() => setEditMode(!editMode)}
              className={`rounded-full px-6 ${editMode ? 'bg-slate-200 text-slate-800 hover:bg-slate-300' : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-100 shadow-sm'}`}
            >
              {editMode ? 'Cancel' : 'Edit Profile'}
            </Button>
          </div>

          {editMode ? (
            <div className="space-y-5 max-w-lg">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Department</label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition-shadow"
                />
              </div>

              <div className="border-t border-slate-200 pt-6 mt-8">
                <h3 className="font-bold text-slate-800 mb-4">Security Validation</h3>
                
                <div className="mb-5">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Current Password</label>
                  <input
                    type="password"
                    name="current_password"
                    value={formData.current_password}
                    onChange={handleInputChange}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition-shadow"
                    placeholder="Required if changing email or password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">New Password (Optional)</label>
                  <input
                    type="password"
                    name="new_password"
                    value={formData.new_password}
                    onChange={handleInputChange}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 transition-shadow"
                    placeholder="Leave blank to keep current password"
                    minLength="8"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <Button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700 rounded-full px-8">
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-10">
              <div>
                <span className="text-sm font-semibold text-slate-500 mb-1 block">Full Name</span>
                <p className="text-slate-900 text-lg font-medium">{profile?.full_name}</p>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-500 mb-1 block">Email</span>
                <p className="text-slate-900 text-lg font-medium">{profile?.email}</p>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-500 mb-1 block">Department</span>
                <p className="text-slate-900 text-lg font-medium">{profile?.department || 'Not specified'}</p>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-500 mb-1 block">Account Role</span>
                <p className="text-slate-900 text-lg font-medium capitalize">{profile?.role}</p>
              </div>
            </div>
          )}
        </div>

        {/* Chat History Section */}
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" /> Recent Conversations
          </h2>

          {chatsLoading ? (
            <div className="text-slate-500 py-6 text-center">Loading history...</div>
          ) : chats.length === 0 ? (
            <div className="text-slate-500 py-10 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-300">
              No chat history available.
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {chats.map(chat => (
                <div
                  key={chat.chat_id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate mb-1">
                      {chat.title || 'Untitled Session'}
                    </h3>
                    <p className="text-sm text-slate-500 truncate mb-3">
                      {chat.last_message || 'Empty conversation'}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                      <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md text-slate-600">
                        <MessageSquare className="w-3 h-3" /> {chat.message_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(chat.updated_at || chat.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:ml-4">
                    <Link
                      to={chat.book_id ? `/chat/${chat.book_id}?chat_id=${chat.chat_id}` : `/chat?chat_id=${chat.chat_id}`}
                      className="px-5 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" /> Resume
                    </Link>
                    <button
                      onClick={() => handleDeleteChat(chat.chat_id)}
                      className="p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                      title="Delete chat"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}