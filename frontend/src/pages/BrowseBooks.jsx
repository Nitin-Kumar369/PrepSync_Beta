import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import API from '../store/authStore'
import { useAuthStore } from '../store/authStore'
import { Skeleton } from '../components/UI'
import { Search, BookOpen, Library, BookText, ArrowLeft, Layers, Clock, TrendingUp } from 'lucide-react'

export default function BrowseBooks() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchAllBooks()
  }, [])

  const fetchAllBooks = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await API.get('/books/all')
      setBooks(res.data.books || [])
    } catch (e) {
      console.error('Failed to fetch books:', e)
      setError('Failed to load the library catalog.')
    } finally {
      setLoading(false)
    }
  }

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books
    const q = searchQuery.toLowerCase()
    return books.filter(b => 
      b.title?.toLowerCase().includes(q) || 
      b.author?.toLowerCase().includes(q) || 
      b.department?.toLowerCase().includes(q) || 
      b.subject?.toLowerCase().includes(q)
    )
  }, [books, searchQuery])

  const recentBooks = useMemo(() => {
    return [...books]
      .sort((a, b) => new Date(b.indexed_date || 0) - new Date(a.indexed_date || 0))
      .slice(0, 3)
  }, [books])

  const popularBooks = useMemo(() => {
    return [...books]
      .sort((a, b) => (b.total_chunks || 0) - (a.total_chunks || 0))
      .slice(0, 6)
  }, [books])

  const handleBookClick = (book) => {
    if (!user) {
      navigate(`/login?redirect=/chat/${book.book_id}`)
    } else {
      navigate(`/chat/${book.book_id}`, { state: { book } })
    }
  }

  const BookCard = ({ book }) => (
    <div
      className='bg-white p-6 rounded-3xl border border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col h-full'
      onClick={() => handleBookClick(book)}
    >
      <div className="flex items-start gap-4 mb-4">
        <div className="bg-slate-50 p-3 rounded-2xl text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 transition-colors shrink-0">
          <BookText className="w-6 h-6" />
        </div>
        <div>
          <h3 className='font-bold text-slate-900 text-lg leading-tight group-hover:text-blue-700 transition-colors line-clamp-2'>
            {book.title}
          </h3>
          <p className='text-sm text-slate-500 mt-1 font-medium line-clamp-1'>
            {book.author || 'Unknown Author'}
          </p>
        </div>
      </div>
      
      <div className="mt-auto space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">
            {book.department}
          </span>
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">
            {book.subject}
          </span>
        </div>
        
        <div className='flex gap-4 pt-4 border-t border-slate-100 text-xs text-slate-400 font-semibold'>
          <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5"/> {book.total_pages || '?'} pages</span>
          <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5"/> {book.total_chunks || '0'} chunks</span>
        </div>
        
        {!user && (
          <div className='text-xs text-blue-600 font-bold bg-blue-50 py-2.5 px-3 rounded-xl text-center'>
            Log in to start chatting
          </div>
        )}
      </div>
    </div>
  )

  return (
    <main className='min-h-screen py-12 bg-white'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='mb-8'>
          <Link to='/' className='inline-flex items-center gap-2 text-blue-600 font-semibold hover:underline bg-blue-50 px-4 py-2 rounded-full text-sm transition-colors'>
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
        </div>

        <section className='mb-12'>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 p-4 rounded-3xl text-blue-600">
                <Library className="w-8 h-8" />
              </div>
              <div>
                <h1 className='text-4xl font-bold text-slate-900 mb-1'>Global Library</h1>
                <p className='text-slate-500 font-medium'>Search and discover books across all departments</p>
              </div>
            </div>
          </div>

          <div className="relative max-w-2xl">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Search className="h-6 w-6 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search by book title, author, subject, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm text-lg"
            />
          </div>
        </section>

        {error && (
          <div className='mb-8 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 flex items-center gap-3 font-medium'>
            ⚠️ {error}
          </div>
        )}

        <section>
          {loading ? (
            <div className="space-y-12">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Skeleton className="w-6 h-6 circular" />
                  <Skeleton className="h-6 w-48" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col h-[240px]">
                      <div className="flex items-start gap-4 mb-4">
                         <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                         <div className="flex-1 space-y-2 mt-1">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-4 w-1/2 mt-2" />
                         </div>
                      </div>
                      <div className="mt-auto space-y-4">
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-16" />
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-slate-100">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : !searchQuery.trim() ? (
            <div className="space-y-12">
              {recentBooks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Clock className="w-5 h-5 text-blue-500" />
                    <h2 className="text-xl font-bold text-slate-900">Recently Added</h2>
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    {recentBooks.map(book => <BookCard key={book.book_id} book={book} />)}
                  </div>
                </div>
              )}

              {popularBooks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-6 border-t border-slate-100 pt-10">
                    <TrendingUp className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-xl font-bold text-slate-900">Popular Resources</h2>
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    {popularBooks.map(book => <BookCard key={book.book_id} book={book} />)}
                  </div>
                </div>
              )}

              {books.length === 0 && (
                <div className='bg-slate-50 rounded-3xl border border-slate-200 p-16 text-center flex flex-col items-center justify-center'>
                  <Library className="w-12 h-12 text-slate-300 mb-4" />
                  <p className='text-xl font-bold text-slate-900 mb-2'>Library is empty</p>
                  <p className="text-slate-500 font-medium">No books have been uploaded yet.</p>
                </div>
              )}
            </div>
          ) : filteredBooks.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Search className="w-5 h-5 text-blue-500" />
                <h2 className="text-xl font-bold text-slate-900">
                  Search Results <span className="text-slate-400 font-medium text-base ml-2">({filteredBooks.length})</span>
                </h2>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {filteredBooks.map((book) => (
                  <BookCard key={book.book_id} book={book} />
                ))}
              </div>
            </div>
          ) : (
            <div className='bg-slate-50 rounded-3xl border border-slate-200 p-16 text-center flex flex-col items-center justify-center'>
              <Search className="w-12 h-12 text-slate-300 mb-4" />
              <p className='text-xl font-bold text-slate-900 mb-2'>No books found</p>
              <p className="text-slate-500 font-medium">
                No results match "{searchQuery}". Try adjusting your keywords.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}