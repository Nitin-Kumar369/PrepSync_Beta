import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import API from '../store/authStore'
import { useAuthStore } from '../store/authStore'
import { Skeleton } from '../components/UI'
import { ArrowLeft, BookOpen, Library, FileText, Layers } from 'lucide-react'

export default function DepartmentBooks() {
  const { departmentName } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [years, setYears] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchYears = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await API.get(`/books/departments/${departmentName}/years`)
        setYears(res.data.years || [])
      } catch (e) {
        setError('Failed to load years for this department')
      } finally {
        setLoading(false)
      }
    }
    if (departmentName) fetchYears()
  }, [departmentName])

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedYear) {
        setSubjects([]); setBooks([]); return
      }
      try {
        setLoading(true)
        setError(null)
        const res = await API.get(`/books/departments/${departmentName}/years/${selectedYear}/subjects`)
        setSubjects(res.data.subjects || [])
        setBooks([])
      } catch (e) {
        setError('Failed to load subjects for this year')
      } finally {
        setLoading(false)
      }
    }
    fetchSubjects()
  }, [selectedYear, departmentName])

  const fetchBooksForSubject = async (subject) => {
    if (!selectedYear) return
    try {
      setLoading(true)
      setError(null)
      const res = await API.get(`/books/departments/${departmentName}/years/${selectedYear}/subjects/${subject}`)
      setBooks(res.data.books || [])
    } catch (e) {
      setError('Failed to load books for this subject')
    } finally {
      setLoading(false)
    }
  }

  const handleBookClick = (bookId) => {
    if (!user) navigate(`/login?redirect=/chat/${bookId}`)
    else navigate(`/chat/${bookId}`)
  }

  return (
    <main className='min-h-screen py-12 bg-white'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='mb-8'>
          <Link to='/' className='inline-flex items-center gap-2 text-blue-600 font-semibold hover:underline bg-blue-50 px-4 py-2 rounded-full text-sm transition-colors'>
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
        </div>

        <section className='mb-12 flex items-center gap-4'>
          <div className="bg-slate-100 p-4 rounded-3xl text-slate-700">
            <Library className="w-8 h-8" />
          </div>
          <div>
            <h1 className='text-4xl font-bold text-slate-900 mb-1'>{departmentName}</h1>
            <p className='text-slate-500 font-medium'>Select an academic year and subject to view resources</p>
          </div>
        </section>

        {error && (
          <div className='mb-8 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 flex items-center gap-3 font-medium'>
             ⚠️ {error}
          </div>
        )}

        {loading && years.length === 0 && (
          <section className='mb-12'>
            <Skeleton className="w-32 h-6 mb-4" />
            <div className='flex flex-wrap gap-3'>
               {[1, 2, 3, 4].map(i => <Skeleton key={i} className="w-28 h-12 rounded-2xl" />)}
            </div>
          </section>
        )}

        {years.length > 0 && (
          <section className='mb-12'>
            <h2 className='text-lg font-bold mb-4 text-slate-400 tracking-wider uppercase'>Select Year</h2>
            <div className='flex flex-wrap gap-3'>
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-6 py-3 rounded-2xl border-2 transition-all font-bold text-sm shadow-sm ${
                    selectedYear === year
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:shadow'
                  }`}
                >
                  {year} Year
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedYear && (
          <section>
            <h2 className='text-lg font-bold mb-6 text-slate-400 tracking-wider uppercase'>Choose Subject</h2>
            
            {loading && subjects.length === 0 ? (
               <div className="grid grid-cols-1 gap-6">
                 {[1, 2].map(i => (
                   <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-6">
                         <Skeleton className="w-6 h-6 circular" />
                         <Skeleton className="w-48 h-8" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                         {[1, 2, 3].map(j => (
                           <div key={j} className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                             <Skeleton className="w-3/4 h-6 mb-2" />
                             <Skeleton className="w-1/2 h-4 mb-4" />
                             <div className="flex gap-4 pt-4 border-t border-slate-200">
                               <Skeleton className="w-16 h-4" />
                               <Skeleton className="w-16 h-4" />
                             </div>
                           </div>
                         ))}
                      </div>
                   </div>
                 ))}
               </div>
            ) : (
              <div className='grid grid-cols-1 gap-6'>
                {subjects.map((subject) => (
                  <div
                    key={subject}
                    className='bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer'
                    onClick={() => fetchBooksForSubject(subject)}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <BookOpen className="w-6 h-6 text-blue-600" />
                      <h3 className='text-2xl font-bold text-slate-900'>{subject}</h3>
                    </div>

                    {loading && books.length === 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
                        {[1, 2, 3].map(j => (
                          <div key={j} className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                            <Skeleton className="w-3/4 h-6 mb-2" />
                            <Skeleton className="w-1/2 h-4 mb-4" />
                            <div className="flex gap-4 pt-4 border-t border-slate-200">
                              <Skeleton className="w-16 h-4" />
                              <Skeleton className="w-16 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : books.length > 0 && books[0].subject === subject ? (
                      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'>
                        {books.map((book) => (
                          <div
                            key={book.book_id}
                            className='bg-slate-50 p-5 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer group flex flex-col'
                            onClick={(e) => { e.stopPropagation(); handleBookClick(book.book_id); }}
                          >
                            <h4 className='font-bold text-slate-900 text-lg mb-2 leading-tight group-hover:text-blue-700 transition-colors'>{book.title}</h4>
                            <p className='text-sm text-slate-500 mb-4 flex-grow'>{book.author || 'Unknown Author'}</p>
                            
                            <div className='flex gap-4 pt-4 border-t border-slate-200 text-xs text-slate-400 font-semibold'>
                              <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> {book.total_pages || '?'} pages</span>
                              <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5"/> {book.total_chunks || '0'} chunks</span>
                            </div>
                            {!user && (
                              <p className='text-xs text-blue-600 font-bold mt-4 bg-blue-50 py-2 px-3 rounded-lg text-center'>Click to login and chat</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className='text-sm text-slate-500 font-medium'>Click to expand resources in this subject</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!loading && years.length === 0 && (
          <div className='bg-slate-50 rounded-3xl border border-slate-200 p-16 text-center flex flex-col items-center justify-center'>
            <Library className="w-12 h-12 text-slate-300 mb-4" />
            <p className='text-lg font-medium text-slate-900'>No resources available</p>
            <p className="text-slate-500">Books for this department have not been uploaded yet.</p>
          </div>
        )}
      </div>
    </main>
  )
}