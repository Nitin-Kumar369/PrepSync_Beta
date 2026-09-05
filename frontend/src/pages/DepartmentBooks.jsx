import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import API from '../store/authStore'
import { useAuthStore } from '../store/authStore'

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

  // Fetch years for this department
  useEffect(() => {
    const fetchYears = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await API.get(`/books/departments/${departmentName}/years`)
        setYears(res.data.years || [])
      } catch (e) {
        console.error('Failed to fetch years:', e)
        setError('Failed to load years for this department')
      } finally {
        setLoading(false)
      }
    }
    if (departmentName) {
      fetchYears()
    }
  }, [departmentName])

  // Fetch subjects when year is selected
  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedYear) {
        setSubjects([])
        setBooks([])
        return
      }
      try {
        setLoading(true)
        setError(null)
        const res = await API.get(
          `/books/departments/${departmentName}/years/${selectedYear}/subjects`
        )
        setSubjects(res.data.subjects || [])
        setBooks([])
      } catch (e) {
        console.error('Failed to fetch subjects:', e)
        setError('Failed to load subjects for this year')
      } finally {
        setLoading(false)
      }
    }
    fetchSubjects()
  }, [selectedYear, departmentName])

  // Fetch books for all subjects in selected year
  const fetchBooksForSubject = async (subject) => {
    if (!selectedYear) return
    try {
      setLoading(true)
      setError(null)
      const res = await API.get(
        `/books/departments/${departmentName}/years/${selectedYear}/subjects/${subject}`
      )
      setBooks(res.data.books || [])
    } catch (e) {
      console.error('Failed to fetch books:', e)
      setError('Failed to load books for this subject')
    } finally {
      setLoading(false)
    }
  }

  const handleBookClick = (bookId) => {
    if (!user) {
      // Store the intended destination and redirect to login
      navigate(`/login?redirect=/chat/${bookId}`)
    } else {
      navigate(`/chat/${bookId}`)
    }
  }

  return (
    <main className='min-h-screen py-10'>
      <div className='max-w-6xl mx-auto px-4'>
        {/* Breadcrumb */}
        <div className='mb-8'>
          <Link to='/' className='text-accent hover:underline'>← Home</Link>
        </div>

        {/* Header */}
        <section className='mb-10'>
          <h1 className='text-4xl font-bold mb-2'>📚 {departmentName}</h1>
          <p className='text-lg muted'>Select a year and subject to browse available textbooks</p>
        </section>

        {error && (
          <div className='mb-6 p-4 bg-red-100 text-red-700 rounded-lg border border-red-300'>
            {error}
          </div>
        )}

        {/* Year selector */}
        {years.length > 0 && (
          <section className='mb-10'>
            <h2 className='text-2xl font-bold mb-4'>Select Year</h2>
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3'>
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`p-4 rounded-lg border-2 transition-all font-semibold ${
                    selectedYear === year
                      ? 'bg-accent text-white border-accent'
                      : 'card border-gray-600 hover:border-accent'
                  }`}
                >
                  {year} Year
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Subject and Books section */}
        {selectedYear && subjects.length > 0 && (
          <section>
            <h2 className='text-2xl font-bold mb-6'>Choose Subject</h2>
            <div className='grid grid-cols-1 gap-6'>
              {subjects.map((subject) => (
                <div
                  key={subject}
                  className='card p-6 rounded-lg border border-gray-700 hover:border-accent transition-colors cursor-pointer'
                  onClick={() => fetchBooksForSubject(subject)}
                >
                  <h3 className='text-xl font-semibold mb-4'>📖 {subject}</h3>

                  {loading ? (
                    <p className='muted'>Loading books...</p>
                  ) : books.length > 0 && books[0].subject === subject ? (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                      {books.map((book) => (
                        <div
                          key={book.book_id}
                          className='bg-primary p-4 rounded-lg border border-gray-700 hover:border-accent hover:shadow-lg transition-all cursor-pointer'
                          onClick={() => handleBookClick(book.book_id)}
                        >
                          <h4 className='font-semibold text-base mb-2'>{book.title}</h4>
                          <p className='text-sm muted mb-2'>{book.author || 'Unknown Author'}</p>
                          <div className='flex gap-3 text-xs muted'>
                            <span>📄 {book.total_pages || '?'} pages</span>
                            <span>📚 {book.total_chunks || '0'} chunks</span>
                          </div>
                          {!user && (
                            <p className='text-xs text-accent mt-3'>Click to login and chat</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm muted'>Click to view books in this subject</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!loading && years.length === 0 && (
          <div className='card p-8 text-center'>
            <p className='text-lg muted'>No books available in this department yet.</p>
          </div>
        )}
      </div>
    </main>
  )
}
