import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import Button from '../components/UI/Button'

export default function Account() {
  // Profile state
  const [profile, setProfile] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Edit form state
  const [formData, setFormData] = useState({
    full_name: '',
    department: '',
    email: '',
    new_password: '',
    current_password: ''
  })

  // Sessions state
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Load profile on mount
  useEffect(() => {
    fetchProfile()
    fetchSessions()
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
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchSessions = async () => {
    setSessionsLoading(true)
    try {
      const res = await API.get('/sessions')
      setSessions(res.data || [])
    } catch (e) {
      console.error('Failed to load sessions:', e)
    } finally {
      setSessionsLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
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
      // Clear password fields
      setFormData(prev => ({
        ...prev,
        current_password: '',
        new_password: ''
      }))
      // Refresh profile
      fetchProfile()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update profile')
    }
  }

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Delete this session?')) return
    
    try {
      await API.delete(`/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    } catch (e) {
      alert('Failed to delete: ' + (e.response?.data?.detail || e.message))
    }
  }

  if (loading) {
    return <div className="text-center mt-8">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">👤 My Account</h1>

      {/* Error/Success messages */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 p-4 rounded mb-4">
          {success}
        </div>
      )}

      {/* Profile Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Profile Information</h2>
          <Button
            onClick={() => setEditMode(!editMode)}
            className={editMode ? 'bg-gray-500' : 'bg-blue-500'}
          >
            {editMode ? 'Cancel' : 'Edit'}
          </Button>
        </div>

        {editMode ? (
          // Edit Form
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleInputChange}
                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Department</label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full p-2 border rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Password change section */}
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Change Password (Optional)</h3>
              
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <input
                  type="password"
                  name="current_password"
                  value={formData.current_password}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded focus:outline-none focus:border-blue-500"
                  placeholder="Required if changing email or password"
                />
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input
                  type="password"
                  name="new_password"
                  value={formData.new_password}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded focus:outline-none focus:border-blue-500"
                  placeholder="Leave blank to keep current password"
                  minLength="8"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveProfile} className="bg-green-500">
                Save Changes
              </Button>
              <Button onClick={() => setEditMode(false)} className="bg-gray-500">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          // Display View
          <div className="space-y-3">
            <div>
              <span className="font-medium">Full Name:</span>
              <p className="text-gray-700">{profile?.full_name}</p>
            </div>
            <div>
              <span className="font-medium">Email:</span>
              <p className="text-gray-700">{profile?.email}</p>
            </div>
            <div>
              <span className="font-medium">Department:</span>
              <p className="text-gray-700">{profile?.department || 'Not specified'}</p>
            </div>
            <div>
              <span className="font-medium">Role:</span>
              <p className="text-gray-700 capitalize">{profile?.role}</p>
            </div>
            <div>
              <span className="font-medium">Account Status:</span>
              <p className={profile?.active ? 'text-green-600' : 'text-red-600'}>
                {profile?.active ? 'Active' : 'Inactive'}
              </p>
            </div>
            {profile?.last_login && (
              <div>
                <span className="font-medium">Last Login:</span>
                <p className="text-gray-700">
                  {new Date(profile.last_login).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat Sessions Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📝 Recent Chat Sessions</h2>

        {sessionsLoading ? (
          <div className="text-gray-500">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="text-gray-500">No chat sessions yet</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sessions.map(session => (
              <div
                key={session.session_id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {session.title || session.book_id}
                  </p>
                  <p className="text-sm text-gray-600">
                    {session.subject} • {session.message_count} messages
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(session.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 ml-2">
                  <a
                    href={`/chat?session_id=${session.session_id}`}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    Continue
                  </a>
                  <button
                    onClick={() => handleDeleteSession(session.session_id)}
                    className="px-2 py-1 text-red-600 hover:text-red-800"
                    title="Delete session"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
