import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import { Button, Input, Modal, Skeleton } from '../components/UI'
import { Folder, FolderOpen, BookOpen, Book, Plus, Trash2, Edit, Copy, Upload } from 'lucide-react'

export default function Admin() {
  const [activeTab, setActiveTab] = useState('library')

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userFilter, setUserFilter] = useState('')

  const [books, setBooks] = useState([])
  const [booksLoading, setBooksLoading] = useState(false)
  const [bookFilter, setBookFilter] = useState('')

  const [testQuery, setTestQuery] = useState('')
  const [testBookId, setTestBookId] = useState('')
  const [testResults, setTestResults] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [allBooks, setAllBooks] = useState([])

  const [geminiKey, setGeminiKey] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyMessage, setKeyMessage] = useState(null)

  const [treeDepts, setTreeDepts] = useState([])
  const [treeYears, setTreeYears] = useState({}) 
  const [treeSubjects, setTreeSubjects] = useState({})
  const [allAdminBooks, setAllAdminBooks] = useState([])
  const [expandedNodes, setExpandedNodes] = useState({ depts: {}, years: {}, subjects: {} })
  
  const [uploadModal, setUploadModal] = useState(null) 
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadData, setUploadData] = useState({ book_name: '', author: '', isbn: '' })
  const [uploading, setUploading] = useState(false)

  const [copyModal, setCopyModal] = useState(null) 
  const [copyTarget, setCopyTarget] = useState({ department: '', year_of_study: '', subject: '' })
  
  const [editBookModal, setEditBookModal] = useState(null) 
  const [editData, setEditData] = useState({ title: '', author: '' })

  useEffect(() => {
    if (activeTab === 'stats') fetchStats()
    if (activeTab === 'users') fetchUsers()
    if (activeTab === 'books') fetchBooks()
    if (activeTab === 'library') {
      fetchTreeDepts()
      fetchAllAdminBooks()
    }
    if (activeTab === 'rag-test') fetchAllBooks()
  }, [activeTab])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchStats = async () => {
    setStatsLoading(true)
    try {
      const res = await API.get('/admin/stats')
      setStats(res.data)
    } catch (e) {} finally { setStatsLoading(false) }
  }

  const fetchUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await API.get('/admin/users', { params: { role_filter: userFilter || null } })
      setUsers(res.data.users)
    } catch (e) {} finally { setUsersLoading(false) }
  }

  const handleToggleAdmin = async (userId, currentRole) => {
    if (!window.confirm(`Change user role to ${currentRole === 'admin' ? 'student' : 'admin'}?`)) return
    try {
      await API.patch(`/admin/users/${userId}/role`)
      fetchUsers()
    } catch (e) { alert('Failed to update role') }
  }

  const handleDeactivateUser = async (userId) => {
    if (!window.confirm('Deactivate this user?')) return
    try {
      await API.patch(`/admin/users/${userId}/deactivate`)
      fetchUsers()
    } catch (e) { alert('Failed to deactivate') }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Delete this user and all associated data?')) return
    try {
      await API.delete(`/admin/users/${userId}`)
      fetchUsers()
    } catch (e) { alert('Failed to delete') }
  }

  const fetchBooks = async () => {
    setBooksLoading(true)
    try {
      const res = await API.get('/admin/books-full', { params: { status_filter: bookFilter || null } })
      setBooks(res.data.books)
    } catch (e) {} finally { setBooksLoading(false) }
  }

  const handleDeleteBook = async (bookId) => {
    if (!window.confirm('Delete this book and all vectors?')) return
    try {
      await API.delete(`/admin/book/${bookId}`)
      fetchBooks()
    } catch (e) { alert('Failed to delete') }
  }

  const fetchAllBooks = async () => {
    try {
      const res = await API.get('/admin/books')
      setAllBooks(res.data.books)
    } catch (e) {}
  }

  const handleTestRAG = async () => {
    if (!testQuery.trim()) { alert('Please enter a query'); return }
    setTestLoading(true)
    try {
      const res = await API.post('/admin/rag/test', { query: testQuery, book_id: testBookId || null, top_k: 5 })
      setTestResults(res.data)
    } catch (e) { alert('Failed to test RAG') } finally { setTestLoading(false) }
  }

  const fetchTreeDepts = async () => {
    try {
      const res = await API.get('/admin/departments')
      setTreeDepts(res.data)
    } catch (e) {}
  }

  const fetchAllAdminBooks = async () => {
    try {
      const res = await API.get('/admin/books-full')
      setAllAdminBooks(res.data.books || [])
    } catch (e) {}
  }

  const toggleDept = async (deptName) => {
    const isExp = expandedNodes.depts[deptName]
    setExpandedNodes(p => ({ ...p, depts: { ...p.depts, [deptName]: !isExp } }))
    if (!isExp && !treeYears[deptName]) {
      try {
        const res = await API.get(`/admin/departments/${encodeURIComponent(deptName)}/years`)
        setTreeYears(p => ({ ...p, [deptName]: res.data.years }))
      } catch (e) {}
    }
  }

  const toggleYear = async (deptName, yearName) => {
    const key = `${deptName}|${yearName}`
    const isExp = expandedNodes.years[key]
    setExpandedNodes(p => ({ ...p, years: { ...p.years, [key]: !isExp } }))
    if (!isExp && !treeSubjects[key]) {
      try {
        const res = await API.get(`/admin/departments/${encodeURIComponent(deptName)}/years/${encodeURIComponent(yearName)}/subjects`)
        setTreeSubjects(p => ({ ...p, [key]: res.data.subjects }))
      } catch (e) {}
    }
  }

  const toggleSubject = (deptName, yearName, subjName) => {
    const key = `${deptName}|${yearName}|${subjName}`
    setExpandedNodes(p => ({ ...p, subjects: { ...p.subjects, [key]: !p.subjects[key] } }))
  }

  const handleAddDept = async () => {
    const name = prompt("Enter new department name:")
    if (!name) return
    try {
      await API.post(`/admin/departments?name=${encodeURIComponent(name)}`)
      fetchTreeDepts()
    } catch (e) { alert('Failed to add department') }
  }

  const handleAddYear = async (e, deptName) => {
    e.stopPropagation()
    const year = prompt(`Enter new year for ${deptName}:`)
    if (!year) return
    try {
      await API.post(`/admin/departments/${encodeURIComponent(deptName)}/years?year=${encodeURIComponent(year)}`)
      const res = await API.get(`/admin/departments/${encodeURIComponent(deptName)}/years`)
      setTreeYears(p => ({ ...p, [deptName]: res.data.years }))
      setExpandedNodes(p => ({ ...p, depts: { ...p.depts, [deptName]: true } }))
    } catch (e) { alert('Failed to add year') }
  }

  const handleAddSubject = async (e, deptName, yearName) => {
    e.stopPropagation()
    const subj = prompt(`Enter new subject for ${deptName} - ${yearName}:`)
    if (!subj) return
    try {
      await API.post(`/admin/departments/${encodeURIComponent(deptName)}/years/${encodeURIComponent(yearName)}/subjects?subject=${encodeURIComponent(subj)}`)
      const key = `${deptName}|${yearName}`
      const res = await API.get(`/admin/departments/${encodeURIComponent(deptName)}/years/${encodeURIComponent(yearName)}/subjects`)
      setTreeSubjects(p => ({ ...p, [key]: res.data.subjects }))
      setExpandedNodes(p => ({ ...p, years: { ...p.years, [key]: true } }))
    } catch (e) { alert('Failed to add subject') }
  }

  const handleRemoveDept = async (e, deptName) => {
    e.stopPropagation()
    if (!window.confirm(`Delete department ${deptName} and ALL its books?`)) return
    try {
      await API.delete(`/admin/departments/${encodeURIComponent(deptName)}`)
      fetchTreeDepts()
      fetchAllAdminBooks()
    } catch (e) { alert('Failed to delete department') }
  }

  const handleRemoveYear = async (e, deptName, yearName) => {
    e.stopPropagation()
    if (!window.confirm(`Delete year ${yearName} and ALL its books?`)) return
    try {
      await API.delete(`/admin/departments/${encodeURIComponent(deptName)}/years/${encodeURIComponent(yearName)}`)
      const res = await API.get(`/admin/departments/${encodeURIComponent(deptName)}/years`)
      setTreeYears(p => ({ ...p, [deptName]: res.data.years }))
      fetchAllAdminBooks()
    } catch (e) { alert('Failed to delete year') }
  }

  const handleRemoveSubject = async (e, deptName, yearName, subjName) => {
    e.stopPropagation()
    if (!window.confirm(`Delete subject ${subjName} and ALL its books?`)) return
    try {
      await API.delete(`/admin/departments/${encodeURIComponent(deptName)}/years/${encodeURIComponent(yearName)}/subjects/${encodeURIComponent(subjName)}`)
      const key = `${deptName}|${yearName}`
      const res = await API.get(`/admin/departments/${encodeURIComponent(deptName)}/years/${encodeURIComponent(yearName)}/subjects`)
      setTreeSubjects(p => ({ ...p, [key]: res.data.subjects }))
      fetchAllAdminBooks()
    } catch (e) { alert('Failed to delete subject') }
  }

  const handleRemoveBookTree = async (e, bookId) => {
    e.stopPropagation()
    if (!window.confirm('Delete this book and all chunks?')) return
    try {
      await API.delete(`/admin/book/${bookId}`)
      fetchAllAdminBooks()
    } catch (e) { alert('Failed to delete book') }
  }

  const submitUpload = async () => {
    if (!uploadFile || !uploadData.book_name) {
      alert("File and Book Name are required")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('book_name', uploadData.book_name)
      fd.append('department', uploadModal.dept)
      fd.append('year_of_study', uploadModal.year)
      fd.append('subject', uploadModal.subject)
      if (uploadData.author) fd.append('author', uploadData.author)
      if (uploadData.isbn) fd.append('isbn', uploadData.isbn)

      await API.post('/admin/upload-book', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      alert('Upload queued successfully!')
      setUploadModal(null)
      setUploadFile(null)
      setUploadData({ book_name: '', author: '', isbn: '' })
      fetchAllAdminBooks()
    } catch (e) { alert('Upload failed') } finally { setUploading(false) }
  }

  const submitCopy = async () => {
    if (!copyTarget.department || !copyTarget.year_of_study || !copyTarget.subject) {
      alert("All target fields are required")
      return
    }
    try {
      const fd = new FormData()
      fd.append('target_department', copyTarget.department)
      fd.append('target_year', copyTarget.year_of_study)
      fd.append('target_subject', copyTarget.subject)
      
      await API.post(`/admin/book/${copyModal.book_id}/copy`, fd)
      alert("Book copy initiated successfully!")
      setCopyModal(null)
      fetchTreeDepts() 
      fetchAllAdminBooks()
    } catch (e) { alert('Copy failed') }
  }

  const submitEdit = async () => {
    if (!editData.title) {
      alert("Title is required")
      return
    }
    try {
      const fd = new FormData()
      fd.append('title', editData.title)
      fd.append('author', editData.author)
      await API.put(`/admin/book/${editBookModal.book_id}`, fd)
      setEditBookModal(null)
      fetchAllAdminBooks()
    } catch (e) { alert('Edit failed') }
  }

  const fetchSettings = async () => {
    try {
      const res = await API.get('/admin/settings')
      setGeminiKey(res.data.gemini_api_key || '')
    } catch (e) {}
  }

  const handleSaveSettings = async () => {
    setKeyLoading(true)
    try {
      await API.post('/admin/settings', { gemini_api_key: geminiKey })
      setKeyMessage('Gemini key saved successfully')
    } catch (e) { setKeyMessage('Failed to save') } finally { setKeyLoading(false) }
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Admin Dashboard</h1>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200">
          {[
            { id: 'stats', label: 'Statistics' },
            { id: 'users', label: 'Users' },
            { id: 'books', label: 'All Books (Flat)' },
            { id: 'library', label: 'Library Manager' },
            { id: 'rag-test', label: 'RAG Testing' },
            { id: 'settings', label: 'Settings' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 font-semibold text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-slate-500 hover:text-slate-800'
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
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {[1, 2, 3, 4, 5, 6].map(i => (
                   <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200">
                     <Skeleton className="w-24 h-4 mb-3 text" />
                     <Skeleton className="w-16 h-8 text" />
                   </div>
                 ))}
               </div>
            ) : stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-slate-500 font-medium text-sm mb-1">Total Users</div>
                  <div className="text-3xl font-bold text-slate-900">{stats.total_users}</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-slate-500 font-medium text-sm mb-1">Total Books</div>
                  <div className="text-3xl font-bold text-slate-900">{stats.total_books}</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-slate-500 font-medium text-sm mb-1">Total Chunks</div>
                  <div className="text-3xl font-bold text-slate-900">{stats.total_chunks}</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-slate-500 font-medium text-sm mb-1">Storage Used</div>
                  <div className="text-3xl font-bold text-slate-900">{stats.storage_gib.toFixed(2)} GB</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-slate-500 font-medium text-sm mb-1">Active Chats (24h)</div>
                  <div className="text-3xl font-bold text-slate-900">{stats.active_chats_last_24h}</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-slate-500 font-medium text-sm mb-1">System Health</div>
                  <div className={`text-2xl font-bold capitalize ${
                    stats.system_health === 'healthy' ? 'text-green-600' :
                    stats.system_health === 'warning' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {stats.system_health}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">No statistics available</div>
            )}
          </div>
        )}

        {/* TAB: Users */}
        {activeTab === 'users' && (
          <div>
            <div className="mb-6">
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
              >
                <option value="">All Roles</option>
                <option value="admin">Admins</option>
                <option value="student">Students</option>
              </select>
            </div>

            {usersLoading ? (
               <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                 <table className="w-full text-sm text-left text-slate-600">
                   <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                     <tr><th className="px-6 py-4">Email</th><th className="px-6 py-4">Name</th><th className="px-6 py-4">Role</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Actions</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {[1, 2, 3, 4, 5].map(i => (
                       <tr key={i}>
                         <td className="px-6 py-4"><Skeleton className="w-40 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-32 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-16 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-16 h-6 rounded-full" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-32 h-4 text" /></td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No users found</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(user => (
                      <tr key={user.user_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{user.email}</td>
                        <td className="px-6 py-4">{user.full_name}</td>
                        <td className="px-6 py-4 capitalize font-medium">{user.role}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {user.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 space-x-3 font-medium">
                          <button onClick={() => handleToggleAdmin(user.user_id, user.role)} className="text-blue-600 hover:text-blue-800">
                            {user.role === 'admin' ? 'Demote' : 'Promote'}
                          </button>
                          {user.active && (
                            <button onClick={() => handleDeactivateUser(user.user_id)} className="text-yellow-600 hover:text-yellow-800">
                              Deactivate
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(user.user_id)} className="text-red-600 hover:text-red-800">
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

        {/* TAB: Books Flat */}
        {activeTab === 'books' && (
          <div>
            <div className="mb-6">
              <select
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                className="p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
              >
                <option value="">All Status</option>
                <option value="indexed">Indexed</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {booksLoading ? (
               <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                 <table className="w-full text-sm text-left text-slate-600">
                   <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                     <tr><th className="px-6 py-4">Title</th><th className="px-6 py-4">Author</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Chunks</th><th className="px-6 py-4">Size (MB)</th><th className="px-6 py-4">Actions</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {[1, 2, 3, 4, 5].map(i => (
                       <tr key={i}>
                         <td className="px-6 py-4"><Skeleton className="w-48 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-24 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-16 h-6 rounded-full" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-10 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-10 h-4 text" /></td>
                         <td className="px-6 py-4"><Skeleton className="w-16 h-4 text" /></td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            ) : books.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No books found</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Title</th>
                      <th className="px-6 py-4">Author</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Chunks</th>
                      <th className="px-6 py-4">Size (MB)</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {books.map(book => (
                      <tr key={book.book_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{book.title}</td>
                        <td className="px-6 py-4">{book.author || '-'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            book.status === 'indexed' ? 'bg-green-100 text-green-700' :
                            book.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {book.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">{book.total_chunks}</td>
                        <td className="px-6 py-4">{book.file_size_mb?.toFixed(2) || '-'}</td>
                        <td className="px-6 py-4 text-sm font-medium">
                          <button onClick={() => handleDeleteBook(book.book_id)} className="text-red-600 hover:text-red-800">
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

        {/* TAB: Library Manager (Tree Mode) */}
        {activeTab === 'library' && (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Library Hierarchy</h2>
              <Button onClick={handleAddDept} className="bg-slate-900 text-white hover:bg-slate-800 rounded-full flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Department
              </Button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 space-y-px shadow-inner">
              {treeDepts.length === 0 && <div className="p-6 bg-white text-center text-slate-500 font-medium">No departments found. Create one to begin.</div>}
              {treeDepts.map(dept => (
                <div key={dept.name} className="bg-white">
                  <div 
                    className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleDept(dept.name)}
                  >
                    <span className="font-bold text-slate-800 text-lg flex items-center gap-3">
                      {expandedNodes.depts[dept.name] ? <FolderOpen className="w-5 h-5 text-blue-500" /> : <Folder className="w-5 h-5 text-slate-400" />} 
                      {dept.name}
                    </span>
                    <div className="space-x-4">
                       <button onClick={(e) => handleAddYear(e, dept.name)} className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 inline-flex"><Plus className="w-3.5 h-3.5"/> Year</button>
                       <button onClick={(e) => handleRemoveDept(e, dept.name)} className="text-slate-400 hover:text-red-600 font-medium text-sm flex items-center gap-1 inline-flex"><Trash2 className="w-3.5 h-3.5"/> Delete</button>
                    </div>
                  </div>

                  {expandedNodes.depts[dept.name] && (
                    <div className="pl-10 bg-slate-50/50 pb-3 border-t border-slate-100">
                      {(!treeYears[dept.name] || treeYears[dept.name].length === 0) && (
                        <div className="py-3 text-sm text-slate-400 italic">No academic years added yet.</div>
                      )}
                      {treeYears[dept.name]?.map(year => (
                        <div key={year} className="mt-3 mr-4 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                          <div 
                            className="px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100"
                            onClick={() => toggleYear(dept.name, year)}
                          >
                            <span className="font-bold text-slate-700 flex items-center gap-2">
                               {expandedNodes.years[`${dept.name}|${year}`] ? <FolderOpen className="w-4 h-4 text-indigo-500" /> : <Folder className="w-4 h-4 text-slate-400" />}
                               {year}
                            </span>
                            <div className="space-x-4">
                               <button onClick={(e) => handleAddSubject(e, dept.name, year)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm flex items-center gap-1 inline-flex"><Plus className="w-3.5 h-3.5"/> Subject</button>
                               <button onClick={(e) => handleRemoveYear(e, dept.name, year)} className="text-slate-400 hover:text-red-600 font-medium text-sm flex items-center gap-1 inline-flex"><Trash2 className="w-3.5 h-3.5"/> Delete</button>
                            </div>
                          </div>

                          {expandedNodes.years[`${dept.name}|${year}`] && (
                            <div className="pl-6 pb-3 pt-1 bg-slate-50/30">
                              {(!treeSubjects[`${dept.name}|${year}`] || treeSubjects[`${dept.name}|${year}`].length === 0) && (
                                  <div className="py-2 text-sm text-slate-400 italic">No subjects added yet.</div>
                              )}
                              {treeSubjects[`${dept.name}|${year}`]?.map(subj => {
                                const subjKey = `${dept.name}|${year}|${subj}`;
                                const subjectBooks = allAdminBooks.filter(b => b.department === dept.name && b.year_of_study === year && b.subject === subj);
                                return (
                                  <div key={subj} className="mt-2 border-l-2 border-slate-200 pl-4 bg-transparent py-1 mr-4">
                                    <div 
                                      className="flex justify-between items-center cursor-pointer group"
                                      onClick={() => toggleSubject(dept.name, year, subj)}
                                    >
                                      <span className="font-semibold text-slate-800 flex items-center gap-2">
                                         {expandedNodes.subjects[subjKey] ? <BookOpen className="w-4 h-4 text-emerald-500" /> : <Book className="w-4 h-4 text-slate-400" />}
                                         {subj}
                                      </span>
                                      <div className="space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <button onClick={(e) => { e.stopPropagation(); setUploadModal({dept: dept.name, year, subject: subj}) }} className="text-emerald-600 hover:text-emerald-800 font-medium text-sm flex items-center gap-1 inline-flex"><Upload className="w-3.5 h-3.5"/> Upload Book</button>
                                         <button onClick={(e) => handleRemoveSubject(e, dept.name, year, subj)} className="text-slate-400 hover:text-red-600 font-medium text-sm flex items-center gap-1 inline-flex"><Trash2 className="w-3.5 h-3.5"/> Delete</button>
                                      </div>
                                    </div>

                                    {expandedNodes.subjects[subjKey] && (
                                      <div className="mt-3 space-y-2 pr-2">
                                         {subjectBooks.length === 0 && <div className="text-sm text-slate-400 italic">No books in this subject.</div>}
                                         {subjectBooks.map(book => (
                                            <div key={book.book_id} className="flex justify-between items-center border border-slate-200 bg-white p-3 rounded-lg shadow-sm text-sm hover:border-slate-300 transition-colors">
                                              <div>
                                                <span className="font-bold text-slate-700">{book.title}</span> 
                                                <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${book.status==='indexed'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{book.status}</span>
                                              </div>
                                              <div className="flex gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); setEditBookModal({book_id: book.book_id, title: book.title, author: book.author || ''}); setEditData({title: book.title, author: book.author || ''}) }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit className="w-4 h-4"/></button>
                                                <button onClick={(e) => { e.stopPropagation(); setCopyModal(book); setCopyTarget({department: book.department, year_of_study: book.year_of_study, subject: book.subject}) }} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Copy"><Copy className="w-4 h-4"/></button>
                                                <button onClick={(e) => handleRemoveBookTree(e, book.book_id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4"/></button>
                                              </div>
                                            </div>
                                         ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: RAG Testing */}
        {activeTab === 'rag-test' && (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Retrieval Tester</h2>
            <div className="space-y-5 max-w-3xl">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Query</label>
                <textarea
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-slate-800"
                  rows={3}
                  placeholder="Enter a query to test RAG retrieval..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Filter by Book (optional)</label>
                <select
                  value={testBookId}
                  onChange={(e) => setTestBookId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                >
                  <option value="">All Library Books</option>
                  {allBooks.map(book => (
                    <option key={book.book_id} value={book.book_id}>
                      {book.title} ({book.status})
                    </option>
                  ))}
                </select>
              </div>

              <Button onClick={handleTestRAG} disabled={testLoading} className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-8">
                {testLoading ? 'Retrieving Context...' : 'Test RAG Pipeline'}
              </Button>

              {testResults && (
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-6">Retrieval Results ({testResults.total_results} found in {testResults.retrieval_time_ms.toFixed(0)}ms)</h3>
                  <div className="space-y-4">
                    {testResults.results.map((result, idx) => (
                      <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="font-bold text-slate-900">Rank #{result.rank} - {result.book_name}</span>
                            <span className="inline-block ml-3 px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                              Score: {result.similarity_score.toFixed(4)}
                            </span>
                          </div>
                        </div>
                        {result.page_start && (
                          <div className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">
                            Pages {result.page_start}-{result.page_end}
                            {result.chapter && ` • Chapter: ${result.chapter}`}
                          </div>
                        )}
                        <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-40 overflow-y-auto font-mono">
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
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-2xl">
             <h2 className="text-2xl font-bold text-slate-900 mb-6">System Configuration</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Google Gemini API Key</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  placeholder="Enter your Gemini API key"
                />
                <p className="text-xs text-slate-500 mt-2 font-medium">
                  Obtain a free API key from the <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>.
                </p>
              </div>

              <Button onClick={handleSaveSettings} disabled={keyLoading} className="bg-blue-600 hover:bg-blue-700 rounded-full px-8 mt-2">
                {keyLoading ? 'Saving...' : 'Save Configuration'}
              </Button>

              {keyMessage && (
                <div className={`p-4 rounded-2xl font-medium mt-4 ${
                  keyMessage.includes('successfully') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {keyMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODALS */}
        <Modal isOpen={!!uploadModal} onClose={() => { setUploadModal(null); setUploadFile(null); }} title="Upload Book to Subject">
          <div className="space-y-5">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-600">
              <span className="font-semibold block text-xs uppercase tracking-wider text-slate-400 mb-1">Target Path</span>
              <strong>{uploadModal?.dept}</strong> &gt; <strong>{uploadModal?.year}</strong> &gt; <strong>{uploadModal?.subject}</strong>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">PDF File *</label>
              <input type="file" accept=".pdf" onChange={(e) => setUploadFile(e.target.files?.[0])} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
            <Input label="Book Name *" value={uploadData.book_name} onChange={e => setUploadData(p => ({...p, book_name: e.target.value}))} />
            <Input label="Author" value={uploadData.author} onChange={e => setUploadData(p => ({...p, author: e.target.value}))} />
            <Input label="ISBN" value={uploadData.isbn} onChange={e => setUploadData(p => ({...p, isbn: e.target.value}))} />
          </div>
          <div className="mt-8 flex justify-end gap-3">
             <Button variant="secondary" onClick={() => setUploadModal(null)} className="rounded-full px-6">Cancel</Button>
             <Button onClick={submitUpload} disabled={uploading} className="rounded-full px-6 bg-blue-600">{uploading ? 'Uploading...' : 'Upload & Process'}</Button>
          </div>
        </Modal>

        <Modal isOpen={!!editBookModal} onClose={() => setEditBookModal(null)} title="Edit Book Metadata">
          <div className="space-y-5">
            <Input label="Title *" value={editData.title} onChange={e => setEditData(p => ({...p, title: e.target.value}))} />
            <Input label="Author" value={editData.author} onChange={e => setEditData(p => ({...p, author: e.target.value}))} />
          </div>
          <div className="mt-8 flex justify-end gap-3">
             <Button variant="secondary" onClick={() => setEditBookModal(null)} className="rounded-full px-6">Cancel</Button>
             <Button onClick={submitEdit} className="rounded-full px-6 bg-blue-600">Save Changes</Button>
          </div>
        </Modal>

        <Modal isOpen={!!copyModal} onClose={() => setCopyModal(null)} title="Copy Book">
          <div className="space-y-5">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
               <p className="text-sm text-slate-700 font-medium">Cloning: <span className="font-bold">{copyModal?.title}</span></p>
               <p className="text-xs text-slate-500 mt-1">Specify the new destination. If the department, year, or subject does not exist, it will be created automatically.</p>
            </div>
            <Input label="Target Department *" value={copyTarget.department} onChange={e => setCopyTarget(p => ({...p, department: e.target.value}))} />
            <Input label="Target Year *" value={copyTarget.year_of_study} onChange={e => setCopyTarget(p => ({...p, year_of_study: e.target.value}))} />
            <Input label="Target Subject *" value={copyTarget.subject} onChange={e => setCopyTarget(p => ({...p, subject: e.target.value}))} />
          </div>
          <div className="mt-8 flex justify-end gap-3">
             <Button variant="secondary" onClick={() => setCopyModal(null)} className="rounded-full px-6">Cancel</Button>
             <Button onClick={submitCopy} className="rounded-full px-6 bg-blue-600">Duplicate Book</Button>
          </div>
        </Modal>

      </div>
    </div>
  )
}