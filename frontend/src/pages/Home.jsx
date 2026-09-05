import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { Link } from 'react-router-dom'
import API from '../store/authStore'
import { Button, Card, Alert, LoadingSpinner } from '../components/UI'

export default function Home() {
  const { user } = useAuthStore()
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await API.get('/books/departments')
        const depts = res.data.departments || res.data || []
        setDepartments(Array.isArray(depts) ? depts : [])
      } catch (e) {
        console.error('Failed to fetch departments:', e.message, e.response?.data)
        setError('Unable to load departments: ' + (e.response?.data?.detail || e.message))
        setDepartments([])
      } finally {
        setLoading(false)
      }
    }
    fetchDepartments()
  }, [])

  return (
    <main className='min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50'>
      <div className='max-w-7xl mx-auto px-4 py-12'>
        {/* Hero Section */}
        <section className='grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16'>
          <div className='space-y-6'>
            <div>
              <h1 className='text-5xl font-bold text-gray-900 mb-4'>
                PrepSync <span className='text-blue-600'>RAG</span>
              </h1>
              <p className='text-xl text-gray-600 leading-relaxed'>
                Access engineering textbooks and learn with an AI-powered chatbot. Get instant, contextual answers grounded in real textbook content.
              </p>
            </div>

            {!user ? (
              <Card className='border-blue-200 bg-blue-50'>
                <h2 className='text-2xl font-semibold text-gray-900 mb-3'>Get Started</h2>
                <p className='text-gray-700 mb-6'>Join our community of learners and start exploring textbooks with AI assistance.</p>
                <div className='flex flex-col sm:flex-row gap-3'>
                  <Link to='/signup' className='flex-1'>
                    <Button size='lg' className='w-full'>Sign Up</Button>
                  </Link>
                  <Link to='/login' className='flex-1'>
                    <Button variant='outline' size='lg' className='w-full'>Log In</Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <Card className='border-green-200 bg-green-50'>
                <h2 className='text-2xl font-semibold text-gray-900 mb-2'>
                  Welcome, {user.full_name || user.email}!
                </h2>
                <p className='text-gray-700 mb-6'>Ready to explore engineering textbooks? Start browsing our collection and chat with AI.</p>
                <Link to='/browse'>
                  <Button size='lg'>Browse Books →</Button>
                </Link>
              </Card>
            )}
          </div>

          {/* Features */}
          <div className='space-y-4'>
            <Card className='hover:shadow-md transition-shadow'>
              <div className='flex gap-4'>
                <div className='text-3xl font-semibold text-blue-600'>1</div>
                <div>
                  <h3 className='text-lg font-semibold text-gray-900 mb-1'>Explore</h3>
                  <p className='text-gray-600'>Browse books by department, year, and subject</p>
                </div>
              </div>
            </Card>
            <Card className='hover:shadow-md transition-shadow'>
              <div className='flex gap-4'>
                <div className='text-3xl font-semibold text-blue-600'>2</div>
                <div>
                  <h3 className='text-lg font-semibold text-gray-900 mb-1'>Ask Questions</h3>
                  <p className='text-gray-600'>Chat with an AI trained on textbook content</p>
                </div>
              </div>
            </Card>
            <Card className='hover:shadow-md transition-shadow'>
              <div className='flex gap-4'>
                <div className='text-3xl font-semibold text-blue-600'>3</div>
                <div>
                  <h3 className='text-lg font-semibold text-gray-900 mb-1'>Learn Faster</h3>
                  <p className='text-gray-600'>Get answers grounded in actual textbook passages</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Departments Section */}
        <section className='border-t border-gray-200 pt-16'>
          <div className='mb-8'>
            <h2 className='text-4xl font-bold text-gray-900 mb-2'>Available Departments</h2>
            <p className='text-lg text-gray-600'>Select a department to start exploring</p>
          </div>

          {error && (
            <Alert variant="error" title="Error Loading Departments" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading && (
            <div className='py-16 flex justify-center'>
              <LoadingSpinner size='lg' label='Loading departments...' />
            </div>
          )}

          {!loading && departments.length > 0 && (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {departments.map((dept) => (
                <Link
                  key={dept}
                  to={`/department/${encodeURIComponent(dept)}`}
                >
                  <Card 
                    hoverable
                    className='h-full border-2 border-transparent hover:border-blue-300'
                  >
                    <div className='flex flex-col h-full justify-between'>
                      <h3 className='text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2'>
                        <span className='text-2xl'>📖</span>
                        {dept}
                      </h3>
                      <p className='text-gray-600 text-sm mb-6 flex-grow'>
                        Explore textbooks and chat with AI-powered assistance
                      </p>
                      <Button variant='primary' size='sm' className='w-full'>
                        Browse Books →
                      </Button>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {!loading && departments.length === 0 && !error && (
            <Card className='text-center py-12 border-2 border-dashed border-gray-300'>
              <p className='text-lg text-gray-600 mb-2'>📭 No departments available</p>
              <p className='text-sm text-gray-500'>Please check back later or contact an administrator</p>
            </Card>
          )}
        </section>
      </div>
    </main>
  )
}
