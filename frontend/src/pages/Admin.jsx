import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import Button from '../components/UI/Button'

export default function Admin() {
  // Tab state
  const [activeTab, setActiveTab] = useState('stats')

  // Stats tab
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Users tab
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userFilter, setUserFilter] = useState('')

  // Books tab
  const [books, setBooks] = useState([])
  const [booksLoading, setBooksLoading] = useState(false)
  const [bookFilter, setBookFilter] = useState('')

  // RAG Testing tab
  const [testQuery, setTestQuery] = useState('')
  const [testBookId, setTestBookId] = useState('')
  const [testResults, setTestResults] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [allBooks, setAllBooks] = useState([])

  // Gemini Settings
  const [geminiKey, setGeminiKey] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyMessage, setKeyMessage] = useState(null)

  // Upload Book tab
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadData, setUploadData] = useState({
    book_name: '',
    department: '',
    year_of_study: '',
    subject: '',
    author: '',
    isbn: ''
  })
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMessage, setUploadMessage] = useState(null)
  const [departments, setDepartments] = useState([])

  // Load data on tab change
  useEffect(() => {
    if (activeTab === 'stats') fetchStats()
    if (activeTab === 'users') fetchUsers()
    if (activeTab === 'books') fetchBooks()
    if (activeTab === 'upload') fetchDepartments()
    if (activeTab === 'rag-test') fetchAllBooks()
  }, [activeTab])

  // Load settings on mount
  useEffect(() => {
    fetchSettings()
  }, [])

  // ============ Stats Tab ============
  const fetchStats = async () => {
    setStatsLoading(true)
    try {
      const res = await API.get('/admin/stats')
      setStats(res.data)
    } catch (e) {
      console.error('Failed to fetch stats:', e)
    } finally {
      setStatsLoading(false)
    }
  }

  // ============ Users Tab ============
  const fetchUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await API.get('/admin/users', {
        params: { role_filter: userFilter || null }
      })
      setUsers(res.data.users)
    } catch (e) {
      console.error('Failed to fetch users:', e)
    } finally {
      setUsersLoading(false)
    }
  }

  const handleToggleAdmin = async (userId, currentRole) => {
    if (!window.confirm(`Change user role to ${currentRole === 'admin' ? 'student' : 'admin'}?`)) return
    try {
      await API.patch(`/admin/users/${userId}/role`)
      fetchUsers()
    } catch (e) {
      alert('Failed to update role: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleDeactivateUser = async (userId) => {
    if (!window.confirm('Deactivate this user?')) return
    try {
      await API.patch(`/admin/users/${userId}/deactivate`)
      fetchUsers()
    } catch (e) {
      alert('Failed to deactivate: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Delete this user and all associated data?')) return
    try {
      await API.delete(`/admin/users/${userId}`)
      fetchUsers()
    } catch (e) {
      alert('Failed to delete: ' + (e.response?.data?.detail || e.message))
    }
  }

  // ============ Books Tab ============
  const fetchBooks = async () => {
    setBooksLoading(true)
    try {
      const res = await API.get('/admin/books-full', {
        params: { status_filter: bookFilter || null }
      })
      setBooks(res.data.books)
    } catch (e) {
      console.error('Failed to fetch books:', e)
    } finally {
      setBooksLoading(false)
    }
  }

  const handleDeleteBook = async (bookId) => {
    if (!window.confirm('Delete this book and all vectors?')) return
    try {
      await API.delete(`/admin/book/${bookId}`)
      fetchBooks()
    } catch (e) {
      alert('Failed to delete: ' + (e.response?.data?.detail || e.message))
    }
  }

  // ============ RAG Testing Tab ============
  const fetchAllBooks = async () => {
    try {
      const res = await API.get('/admin/books')
      setAllBooks(res.data.books)
    } catch (e) {
      console.error('Failed to fetch books:', e)
    }
  }

  const handleTestRAG = async () => {
    if (!testQuery.trim()) {
      alert('Please enter a query')
      return
    }

    setTestLoading(true)
    try {
      const res = await API.post('/admin/rag/test', {
        query: testQuery,
        book_id: testBookId || null,
        top_k: 5
      })
      setTestResults(res.data)
    } catch (e) {
      alert('Failed to test RAG: ' + (e.response?.data?.detail || e.message))
    } finally {
      setTestLoading(false)
    }
  }

  // ============ Upload Tab ============
  const fetchDepartments = async () => {
    try {
      const res = await API.get('/admin/departments')
      setDepartments(res.data.departments || [])
    } catch (e) {
      console.error('Failed to fetch departments:', e)
    }
  }

  const handleUploadChange = (field, value) => {
    setUploadData(prev => ({ ...prev, [field]: value }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setUploadFile(file)
      setUploadMessage(null)
    } else {
      setUploadFile(null)
      setUploadMessage({ type: 'error', text: 'Please select a valid PDF file' })
    }
  }

  const handleUploadBook = async () => {
    if (!uploadFile || !uploadData.book_name || !uploadData.department || !uploadData.year_of_study || !uploadData.subject) {
      setUploadMessage({ type: 'error', text: 'Please fill in all required fields and select a PDF' })
      return
    }

    setUploading(true)
    setUploadMessage(null)
    
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('book_name', uploadData.book_name)
      formData.append('department', uploadData.department)
      formData.append('year_of_study', uploadData.year_of_study)
      formData.append('subject', uploadData.subject)
      if (uploadData.author) formData.append('author', uploadData.author)
      if (uploadData.isbn) formData.append('isbn', uploadData.isbn)

      const res = await API.post('/admin/upload-book', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setUploadMessage({ type: 'success', text: `Book uploaded successfully! Processing...` })
      setUploadFile(null)
      setUploadData({ book_name: '', department: '', year_of_study: '', subject: '', author: '', isbn: '' })
      document.getElementById('file-upload')?.reset?.()
    } catch (e) {
      setUploadMessage({ 
        type: 'error', 
        text: 'Upload failed: ' + (e.response?.data?.detail || e.message) 
      })
    } finally {
      setUploading(false)
    }
  }

  // ============ Settings ============
  const fetchSettings = async () => {
    try {
      const res = await API.get('/admin/settings')
      setGeminiKey(res.data.gemini_api_key || '')
    } catch (e) {
      console.error('Failed to fetch settings:', e)
    }
  }

  const handleSaveSettings = async () => {
    setKeyLoading(true)
    try {
      await API.post('/admin/settings', { gemini_api_key: geminiKey })
      setKeyMessage('Gemini key saved successfully')
    } catch (e) {
      setKeyMessage('Failed to save: ' + (e.response?.data?.detail || e.message))
    } finally {
      setKeyLoading(false)
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b">
        {[
          { id: 'stats', label: 'Statistics' },
          { id: 'users', label: 'Users' },
          { id: 'books', label: 'Books' },
          { id: 'upload', label: 'Upload Book' },
          { id: 'rag-test', label: 'RAG Testing' },
          { id: 'settings', label: 'Settings' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Statistics */}
      {activeTab === 'stats' && (
        <div>
          {statsLoading ? (
            <div className="text-center py-8">Loading statistics...</div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-gray-600 text-sm">Total Users</div>
                <div className="text-3xl font-bold text-blue-600">{stats.total_users}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-gray-600 text-sm">Total Books</div>
                <div className="text-3xl font-bold text-green-600">{stats.total_books}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-gray-600 text-sm">Total Chunks</div>
                <div className="text-3xl font-bold text-purple-600">{stats.total_chunks}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-gray-600 text-sm">Storage Used</div>
                <div className="text-3xl font-bold text-orange-600">{stats.storage_gib.toFixed(2)} GB</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-gray-600 text-sm">Active Chats (24h)</div>
                <div className="text-3xl font-bold text-red-600">{stats.active_chats_last_24h}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-gray-600 text-sm">System Health</div>
                <div className={`text-2xl font-bold capitalize ${
                  stats.system_health === 'healthy' ? 'text-green-600' :
                  stats.system_health === 'warning' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {stats.system_health}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No statistics available</div>
          )}
        </div>
      )}

      {/* TAB: Users */}
      {activeTab === 'users' && (
        <div>
          <div className="mb-4">
            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value)
              }}
              className="p-2 border rounded"
            >
              <option value="">All Roles</option>
              <option value="admin">Admins</option>
              <option value="student">Students</option>
            </select>
          </div>

          {usersLoading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No users found</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map(user => (
                    <tr key={user.user_id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">{user.email}</td>
                      <td className="px-6 py-3">{user.full_name}</td>
                      <td className="px-6 py-3 capitalize">{user.role}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm space-x-2">
                        <button
                          onClick={() => handleToggleAdmin(user.user_id, user.role)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {user.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        {user.active && (
                          <button
                            onClick={() => handleDeactivateUser(user.user_id)}
                            className="text-yellow-600 hover:text-yellow-800"
                          >
                            Deactivate
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user.user_id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Books */}
      {activeTab === 'books' && (
        <div>
          <div className="mb-4">
            <select
              value={bookFilter}
              onChange={(e) => {
                setBookFilter(e.target.value)
              }}
              className="p-2 border rounded"
            >
              <option value="">All Status</option>
              <option value="indexed">Indexed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {booksLoading ? (
            <div className="text-center py-8">Loading books...</div>
          ) : books.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No books found</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium">Title</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Author</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Chunks</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Size (MB)</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {books.map(book => (
                    <tr key={book.book_id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">{book.title}</td>
                      <td className="px-6 py-3">{book.author || '-'}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          book.status === 'indexed' ? 'bg-green-100 text-green-800' :
                          book.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {book.status}
                        </span>
                      </td>
                      <td className="px-6 py-3">{book.total_chunks}</td>
                      <td className="px-6 py-3">{book.file_size_mb?.toFixed(2) || '-'}</td>
                      <td className="px-6 py-3 text-sm">
                        <button
                          onClick={() => handleDeleteBook(book.book_id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Upload Book */}
      {activeTab === 'upload' && (
        <div className="bg-white p-8 rounded-lg shadow max-w-2xl">
          <h2 className="text-2xl font-bold mb-6">Upload New Book</h2>

          {uploadMessage && (
            <div className={`mb-6 p-4 rounded-lg ${
              uploadMessage.type === 'success' 
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {uploadMessage.text}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleUploadBook() }} id="file-upload" className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PDF File *</label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="block w-full px-4 py-2 border border-gray-300 rounded-lg cursor-pointer"
                required
              />
              {uploadFile && (
                <p className="mt-2 text-sm text-green-600">Selected: {uploadFile.name}</p>
              )}
            </div>

            {/* Book Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Book Name *</label>
              <input
                type="text"
                value={uploadData.book_name}
                onChange={(e) => handleUploadChange('book_name', e.target.value)}
                placeholder="e.g., Engineering Mathematics"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Department *</label>
              <select
                value={uploadData.department}
                onChange={(e) => handleUploadChange('department', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select Department</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Year of Study */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year of Study *</label>
              <input
                type="text"
                value={uploadData.year_of_study}
                onChange={(e) => handleUploadChange('year_of_study', e.target.value)}
                placeholder="e.g., 1st Year, 2nd Year"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
              <input
                type="text"
                value={uploadData.subject}
                onChange={(e) => handleUploadChange('subject', e.target.value)}
                placeholder="e.g., Calculus, Physics"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Author (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Author (Optional)</label>
              <input
                type="text"
                value={uploadData.author}
                onChange={(e) => handleUploadChange('author', e.target.value)}
                placeholder="e.g., John Smith"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* ISBN (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ISBN (Optional)</label>
              <input
                type="text"
                value={uploadData.isbn}
                onChange={(e) => handleUploadChange('isbn', e.target.value)}
                placeholder="e.g., 978-0-123456-78-9"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={uploading}
                className={`px-6 py-2 rounded-lg font-medium text-white ${
                  uploading 
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {uploading ? 'Uploading...' : 'Upload Book'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadFile(null)
                  setUploadData({ book_name: '', department: '', year_of_study: '', subject: '', author: '', isbn: '' })
                  setUploadMessage(null)
                }}
                className="px-6 py-2 rounded-lg font-medium text-gray-700 bg-gray-200 hover:bg-gray-300"
              >
                Clear
              </button>
            </div>

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}
          </form>

          <p className="mt-6 text-sm text-gray-600">
            <strong>Note:</strong> Upload a PDF file. The system will extract text, create chunks, and generate embeddings for RAG. This may take several minutes for large PDFs.
          </p>
        </div>
      )}

      {/* TAB: RAG Testing */}
      {activeTab === 'rag-test' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Query</label>
              <textarea
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                className="w-full p-3 border rounded focus:outline-none focus:border-blue-500"
                rows={3}
                placeholder="Enter a query to test RAG retrieval..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Book (optional)</label>
              <select
                value={testBookId}
                onChange={(e) => setTestBookId(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">All Books</option>
                {allBooks.map(book => (
                  <option key={book.book_id} value={book.book_id}>
                    {book.title} ({book.status})
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleTestRAG} disabled={testLoading} className="bg-blue-500">
              {testLoading ? 'Testing...' : 'Test RAG'}
            </Button>

            {testResults && (
              <div className="mt-6 border-t pt-6">
                <h3 className="font-semibold mb-4">Results ({testResults.total_results} found in {testResults.retrieval_time_ms.toFixed(0)}ms)</h3>
                <div className="space-y-4">
                  {testResults.results.map((result, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded border">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium">#{result.rank} - {result.book_name}</span>
                          <span className="text-sm text-gray-600 ml-2">Score: {result.similarity_score.toFixed(4)}</span>
                        </div>
                      </div>
                      {result.page_start && (
                        <div className="text-sm text-gray-600 mb-2">
                          Pages {result.page_start}-{result.page_end}
                          {result.chapter && ` • Chapter: ${result.chapter}`}
                        </div>
                      )}
                      <div className="text-sm bg-white p-2 rounded border max-h-32 overflow-y-auto">
                        {result.text_preview}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Settings */}
      {activeTab === 'settings' && (
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Gemini API Key</label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:border-blue-500"
              placeholder="Enter your Gemini API key"
            />
            <p className="text-xs text-gray-600 mt-1">
              Get your free API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600">ai.google.dev</a>
            </p>
          </div>

          <Button onClick={handleSaveSettings} disabled={keyLoading} className="bg-green-500">
            {keyLoading ? 'Saving...' : 'Save Settings'}
          </Button>

          {keyMessage && (
            <div className={`p-3 rounded ${
              keyMessage.includes('successfully') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {keyMessage}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
