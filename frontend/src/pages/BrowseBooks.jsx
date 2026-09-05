import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../store/authStore'
import Button from '../components/UI/Button'

export default function BrowseBooks() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1: department, 2: year, 3: subject, 4: books
  const [departments, setDepartments] = useState([])
  const [years, setYears] = useState([])
  const [subjects, setSubjects] = useState([])
  const [books, setBooks] = useState([])
  
  const [selectedDept, setSelectedDept] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)
  const [selectedSubject, setSelectedSubject] = useState(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDepartments()
  }, [])

  const fetchDepartments = async () => {
    try {
      setLoading(true)
      const res = await API.get('/books/departments')
      setDepartments(res.data.departments)
    } catch (e) {
      setError('Failed to fetch departments')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const selectDepartment = async (dept) => {
    setSelectedDept(dept)
    try {
      setLoading(true)
      const res = await API.get(`/books/departments/${dept}/years`)
      setYears(res.data.years)
      setStep(2)
    } catch (e) {
      setError('Failed to fetch years')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const selectYear = async (year) => {
    setSelectedYear(year)
    try {
      setLoading(true)
      const res = await API.get(`/books/departments/${selectedDept}/years/${year}/subjects`)
      setSubjects(res.data.subjects)
      setStep(3)
    } catch (e) {
      setError('Failed to fetch subjects')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const selectSubject = async (subject) => {
    setSelectedSubject(subject)
    try {
      setLoading(true)
      const res = await API.get(
        `/books/departments/${selectedDept}/years/${selectedYear}/subjects/${subject}`
      )
      setBooks(res.data.books)
      setStep(4)
    } catch (e) {
      setError('Failed to fetch books')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const selectBook = (book) => {
    // Navigate to chat session with book
    navigate(`/chat/${book.book_id}`, {
      state: {
        book: book,
        department: selectedDept,
        year: selectedYear,
        subject: selectedSubject
      }
    })
  }

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  return (
    <div className='min-h-screen py-8'>
      <div className='max-w-6xl mx-auto px-4'>
        {/* Breadcrumb */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold mb-2'>Browse Engineering Books</h1>
          <div className='flex items-center gap-2 text-gray-600'>
            <span className={step >= 1 ? 'font-bold text-blue-600' : ''}>Department</span>
            {step >= 2 && (
              <>
                <span>→</span>
                <span className={step >= 2 ? 'font-bold text-blue-600' : ''}>Year</span>
              </>
            )}
            {step >= 3 && (
              <>
                <span>→</span>
                <span className={step >= 3 ? 'font-bold text-blue-600' : ''}>Subject</span>
              </>
            )}
            {step >= 4 && (
              <>
                <span>→</span>
                <span className={step >= 4 ? 'font-bold text-blue-600' : ''}>Books</span>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className='mb-6 p-4 bg-red-100 text-red-700 rounded-lg'>
            {error}
            <button onClick={() => setError(null)} className='ml-2 underline'>
              Dismiss
            </button>
          </div>
        )}

        {loading && (
          <div className='flex justify-center py-12'>
            <div className='text-center'>
              <div className='inline-block h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
              <p className='mt-2 text-gray-600'>Loading...</p>
            </div>
          </div>
        )}

        {!loading && (
          <div className='card p-8'>
            {/* Step 1: Department Selection */}
            {step === 1 && (
              <div>
                <h2 className='text-2xl font-semibold mb-6'>Select Department</h2>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {departments.map((dept) => (
                    <div key={dept} className='card p-5 hover:shadow-lg transition'>
                      <h3 className='font-bold text-lg mb-2'>{dept}</h3>
                      <p className='muted text-sm mb-3'>Select to continue</p>
                      <Button onClick={() => selectDepartment(dept)}>Select</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Year Selection */}
            {step === 2 && (
              <div>
                <h2 className='text-2xl font-semibold mb-6'>
                  Select Year of Study - {selectedDept}
                </h2>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6'>
                  {years.map((year) => (
                    <div key={year} className='card p-4 text-center'>
                      <div className='font-bold'>{year}</div>
                      <div className='mt-3'>
                        <Button variant='secondary' onClick={() => selectYear(year)}>Choose</Button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={goBack}
                  className='px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50'
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Step 3: Subject Selection */}
            {step === 3 && (
              <div>
                <h2 className='text-2xl font-semibold mb-2'>
                  Select Subject - {selectedDept}, Year {selectedYear}
                </h2>
                <p className='text-gray-600 mb-6'>Choose a subject to see available books</p>

                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6'>
                  {subjects.map((subject) => (
                    <div key={subject} className='card p-5'>
                      <h3 className='font-bold text-lg mb-2'>{subject}</h3>
                      <p className='muted text-sm mb-3'>View books</p>
                      <Button onClick={() => selectSubject(subject)}>Open</Button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={goBack}
                  className='px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50'
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Step 4: Book Selection */}
            {step === 4 && (
              <div>
                <h2 className='text-2xl font-semibold mb-2'>
                  {selectedSubject} - {selectedDept}
                </h2>
                <p className='text-gray-600 mb-6'>
                  {books.length} book{books.length !== 1 ? 's' : ''} available
                </p>

                {books.length === 0 ? (
                  <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-6'>
                    <p className='text-yellow-800'>No books found for this selection</p>
                  </div>
                ) : (
                  <div className='space-y-3 mb-6'>
                    {books.map((book) => (
                        <div key={book.book_id} className='flex flex-col md:flex-row items-start md:items-center justify-between p-4 border border-gray-200 rounded-lg hover:shadow-lg transition'>
                          <div className='flex-1 mb-3 md:mb-0'>
                            <h3 className='font-bold text-lg'>{book.title}</h3>
                            <p className='muted text-sm'>
                              {book.author} • {book.total_pages} pages • {book.total_chunks} chunks
                            </p>
                          </div>
                          <div>
                            <Button onClick={() => selectBook(book)}>Select</Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                <button
                  onClick={goBack}
                  className='px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50'
                >
                  ← Back
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
