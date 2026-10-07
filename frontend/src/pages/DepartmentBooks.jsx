import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import API from '../store/authStore'
import { useAuthStore } from '../store/authStore'
import { Skeleton } from '../components/UI'
import { ArrowLeft, BookOpen, Library, FileText, Layers } from 'lucide-react'

// Map common subjects to standard abbreviations and clean subtitles
const SUBJECT_MAP = {
  'digital electronics': { abbr: 'DE', full: 'Digital Electronics' },
  'de': { abbr: 'DE', full: 'Digital Electronics' },
  'object oriented programming': { abbr: 'OOP', full: 'Object Oriented Programming' },
  'object-oriented programming': { abbr: 'OOP', full: 'Object Oriented Programming' },
  'oop': { abbr: 'OOP', full: 'Object Oriented Programming' },
  'computer networks': { abbr: 'CN', full: 'Computer Networks' },
  'cn': { abbr: 'CN', full: 'Computer Networks' },
  'data structures': { abbr: 'DSA', full: 'Data Structures & Algorithms' },
  'operating systems': { abbr: 'OS', full: 'Operating Systems' },
  'database management systems': { abbr: 'DBMS', full: 'Database Management Systems' },
}

function getSubjectDisplay(subjectName) {
  const key = (subjectName || '').trim().toLowerCase()
  if (SUBJECT_MAP[key]) {
    return SUBJECT_MAP[key]
  }
  // Fallback: Generate abbreviation from capital letters or first letters of words
  const words = subjectName.trim().split(/\s+/)
  if (words.length > 1) {
    const abbr = words.map(w => w[0].toUpperCase()).join('')
    return { abbr, full: subjectName }
  }
  return { abbr: subjectName.toUpperCase(), full: subjectName }
}

export default function DepartmentBooks() {
  const { departmentName } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [years, setYears] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [activeSubject, setActiveSubject] = useState(null)
  const [booksBySubject, setBooksBySubject] = useState({})
  const [loadingYears, setLoadingYears] = useState(false)
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchYears = async () => {
      try {
        setLoadingYears(true)
        setError(null)
        const res = await API.get(`/books/departments/${encodeURIComponent(departmentName)}/years`)
        const fetchedYears = res.data.years || []
        setYears(fetchedYears)
        if (fetchedYears.length > 0 && !selectedYear) {
          setSelectedYear(fetchedYears[0])
        }
      } catch (e) {
        setError('Failed to load years for this department')
      } finally {
        setLoadingYears(false)
      }
    }
    if (departmentName) fetchYears()
  }, [departmentName])

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedYear) {
        setSubjects([])
        setBooksBySubject({})
        setActiveSubject(null)
        return
      }
      try {
        setLoadingSubjects(true)
        setError(null)
        const res = await API.get(`/books/departments/${encodeURIComponent(departmentName)}/years/${encodeURIComponent(selectedYear)}/subjects`)
        setSubjects(res.data.subjects || [])
        setBooksBySubject({})
        setActiveSubject(null)
      } catch (e) {
        setError('Failed to load subjects for this year')
      } finally {
        setLoadingSubjects(false)
      }
    }
    fetchSubjects()
  }, [selectedYear, departmentName])

  const toggleSubject = async (subject) => {
    // If clicking already open subject, collapse it
    if (activeSubject === subject) {
      setActiveSubject(null)
      return
    }

    setActiveSubject(subject)

    // Load books if not already in local state
    if (!booksBySubject[subject]) {
      try {
        setLoadingBooks(true)
        setError(null)
        const res = await API.get(
          `/books/departments/${encodeURIComponent(departmentName)}/years/${encodeURIComponent(selectedYear)}/subjects/${encodeURIComponent(subject)}`
        )
        setBooksBySubject(prev => ({
          ...prev,
          [subject]: res.data.books || []
        }))
      } catch (e) {
        setError('Failed to load books for this subject')
      } finally {
        setLoadingBooks(false)
      }
    }
  }

  const handleBookClick = (bookId) => {
    if (!user) navigate(`/login?redirect=/chat/${bookId}`)
    else navigate(`/chat/${bookId}`)
  }

  return (
    <main className='min-h-screen py-12 bg-white dark:bg-[#121212] transition-colors'>
      <div className='max-w-6xl mx-auto px-6'>
        <div className='mb-8'>
          <Link to='/' className='inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold hover:underline bg-blue-50 dark:bg-blue-950/40 px-4 py-2 rounded-full text-sm transition-colors'>
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
        </div>

        {/* Department Title Header */}
        <section className='mb-12 flex items-center gap-4'>
          <div className="bg-slate-100 dark:bg-[#1e1e1e] p-4 rounded-3xl text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2a2a2a]">
            <Library className="w-8 h-8" />
          </div>
          <div>
            <h1 className='text-4xl font-bold text-slate-900 dark:text-slate-100 mb-1 tracking-tight'>{departmentName}</h1>
            <p className='text-slate-500 dark:text-slate-400 font-medium'>Select an academic year and subject to view resources</p>
          </div>
        </section>

        {error && (
          <div className='mb-8 p-4 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-2xl border border-red-200 dark:border-red-800 text-sm font-medium'>
            {error}
          </div>
        )}

        {/* Year Pills */}
        {loadingYears && (
          <div className='flex gap-3 mb-12'>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="w-28 h-12 rounded-2xl" />)}
          </div>
        )}

        {years.length > 0 && (
          <section className='mb-12'>
            <h2 className='text-xs font-bold mb-4 text-slate-400 dark:text-slate-500 tracking-wider uppercase'>Select Year</h2>
            <div className='flex flex-wrap gap-3'>
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-6 py-3 rounded-2xl border transition-all font-bold text-sm shadow-sm ${
                    selectedYear === year
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105'
                      : 'bg-white dark:bg-[#1e1e1e] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#2a2a2a] hover:border-blue-400 dark:hover:border-blue-500 hover:shadow'
                  }`}
                >
                  {year} Year
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Choose Subject Section */}
        {selectedYear && (
          <section>
            <h2 className='text-xs font-bold mb-6 text-slate-400 dark:text-slate-500 tracking-wider uppercase'>Choose Subject</h2>

            {loadingSubjects ? (
              <div className="space-y-6">
                {[1, 2].map(i => (
                  <div key={i} className="bg-white dark:bg-[#1e1e1e] p-6 rounded-3xl border border-slate-200 dark:border-[#2a2a2a] h-32">
                    <Skeleton className="w-16 h-6 mb-2" />
                    <Skeleton className="w-36 h-4" />
                  </div>
                ))}
              </div>
            ) : subjects.length === 0 ? (
              <div className='bg-slate-50 dark:bg-[#1e1e1e] rounded-3xl border border-slate-200 dark:border-[#2a2a2a] p-16 text-center text-slate-500 dark:text-slate-400'>
                No subjects found for this academic year.
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-6'>
                {subjects.map((subject) => {
                  const { abbr, full } = getSubjectDisplay(subject)
                  const isExpanded = activeSubject === subject
                  const subjectBooks = booksBySubject[subject] || []
                  const isLoadingThis = loadingBooks && activeSubject === subject

                  return (
                    <div
                      key={subject}
                      onClick={() => toggleSubject(subject)}
                      className={`bg-white dark:bg-[#1e1e1e] p-7 rounded-3xl border transition-all cursor-pointer ${
                        isExpanded
                          ? 'border-blue-500 dark:border-blue-500 shadow-md'
                          : 'border-slate-200 dark:border-[#2a2a2a] hover:border-blue-300 dark:hover:border-[#3a3a3a] shadow-sm hover:shadow'
                      }`}
                    >
                      {/* Subject Card Header */}
                      <div className="flex items-start gap-4">
                        <BookOpen className="w-7 h-7 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                        <div>
                          <h3 className='text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight'>
                            {abbr}
                          </h3>
                          <p className='text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5'>
                            {full}
                          </p>
                        </div>
                      </div>

                      {/* Expanded Books Grid */}
                      {isExpanded && (
                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-[#2a2a2a]" onClick={(e) => e.stopPropagation()}>
                          {isLoadingThis ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                              {[1, 2, 3].map(j => (
                                <div key={j} className="bg-slate-50 dark:bg-[#181818] p-5 rounded-2xl border border-slate-200 dark:border-[#2a2a2a]">
                                  <Skeleton className="w-3/4 h-6 mb-2" />
                                  <Skeleton className="w-1/2 h-4 mb-4" />
                                  <div className="flex gap-4 pt-4 border-t border-slate-200 dark:border-[#2a2a2a]">
                                    <Skeleton className="w-16 h-4" />
                                    <Skeleton className="w-16 h-4" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : subjectBooks.length > 0 ? (
                            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'>
                              {subjectBooks.map((book) => (
                                <div
                                  key={book.book_id}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleBookClick(book.book_id)
                                  }}
                                  className='bg-slate-50 dark:bg-[#181818] p-5 rounded-2xl border border-slate-200 dark:border-[#2a2a2a] hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group flex flex-col'
                                >
                                  <h4 className='font-bold text-slate-900 dark:text-slate-100 text-lg mb-1 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                                    {book.title}
                                  </h4>
                                  <p className='text-sm text-slate-500 dark:text-slate-400 mb-4 flex-grow'>
                                    {book.author || 'Unknown Author'}
                                  </p>

                                  <div className='flex gap-4 pt-4 border-t border-slate-200 dark:border-[#2a2a2a] text-xs text-slate-400 font-semibold'>
                                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> {book.total_pages || '?'} pages</span>
                                    <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5"/> {book.total_chunks || '0'} chunks</span>
                                  </div>

                                  {!user && (
                                    <p className='text-xs text-blue-600 dark:text-blue-400 font-bold mt-4 bg-blue-50 dark:bg-blue-950/40 py-2 px-3 rounded-lg text-center'>
                                      Click to login and chat
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-sm text-slate-400">
                              No indexed books found for this subject.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}