import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { Link } from 'react-router-dom'
import API from '../store/authStore'
import { Button, Card, Alert, Skeleton } from '../components/UI'
import { BookOpen, MessageSquare, Zap, Library, ArrowRight, BookX } from 'lucide-react'

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
    <main className='min-h-screen bg-white'>
      <div className='max-w-6xl mx-auto px-6 py-16 md:py-24'>
        {/* Hero Section */}
        <section className='flex flex-col md:flex-row gap-16 items-center mb-24'>
          <div className='flex-1 space-y-8'>
            <h1 className='text-5xl md:text-6xl font-bold text-slate-900 tracking-tight leading-tight'>
              Your library, <br/>
              <span className='text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600'>
                powered by AI.
              </span>
            </h1>
            <p className='text-lg md:text-xl text-slate-600 leading-relaxed max-w-lg'>
              Access engineering textbooks and learn faster. Get instant, contextual answers grounded purely in real textbook content.
            </p>

            {!user ? (
              <div className='flex flex-col sm:flex-row gap-4 pt-4'>
                <Link to='/signup'>
                  <Button size='lg' className='w-full sm:w-auto rounded-full px-8 py-3 text-base shadow-sm hover:shadow-md transition-all'>
                    Get Started
                  </Button>
                </Link>
                <Link to='/login'>
                  <Button variant='secondary' size='lg' className='w-full sm:w-auto rounded-full px-8 py-3 text-base border-slate-200 hover:bg-slate-50 transition-all'>
                    Log In
                  </Button>
                </Link>
              </div>
            ) : (
              <div className='pt-4'>
                <Link to='/browse'>
                  <Button size='lg' className='rounded-full px-8 py-3 text-base shadow-sm flex items-center gap-2'>
                    Browse Library <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Feature Highlights */}
          <div className='flex-1 w-full space-y-4'>
            <div className='bg-slate-50 p-6 rounded-3xl border border-slate-100 flex gap-5 items-start'>
              <div className='bg-blue-100 p-3 rounded-2xl text-blue-600 shrink-0'>
                <Library className="w-6 h-6" />
              </div>
              <div>
                <h3 className='text-lg font-semibold text-slate-900 mb-1'>Explore the Library</h3>
                <p className='text-slate-600 leading-relaxed'>Browse books seamlessly by department, academic year, and subject.</p>
              </div>
            </div>
            <div className='bg-slate-50 p-6 rounded-3xl border border-slate-100 flex gap-5 items-start'>
              <div className='bg-indigo-100 p-3 rounded-2xl text-indigo-600 shrink-0'>
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className='text-lg font-semibold text-slate-900 mb-1'>Ask Questions</h3>
                <p className='text-slate-600 leading-relaxed'>Chat directly with a responsive AI trained on your specific textbook's context.</p>
              </div>
            </div>
            <div className='bg-slate-50 p-6 rounded-3xl border border-slate-100 flex gap-5 items-start'>
              <div className='bg-emerald-100 p-3 rounded-2xl text-emerald-600 shrink-0'>
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className='text-lg font-semibold text-slate-900 mb-1'>Learn Faster</h3>
                <p className='text-slate-600 leading-relaxed'>Get highly accurate answers backed by cited passages directly from the text.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Departments Section */}
        <section className='pt-8'>
          <div className='mb-10'>
            <h2 className='text-3xl font-bold text-slate-900 mb-3'>Available Departments</h2>
            <p className='text-slate-600'>Select a discipline to start exploring resources.</p>
          </div>

          {error && (
            <Alert variant="error" title="Error Loading Departments" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading && (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className='h-full border border-slate-200 rounded-3xl p-2'>
                  <div className='flex flex-col h-full'>
                    <div className="flex items-center gap-3 mb-4">
                      <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                      <Skeleton className="h-6 w-32" />
                    </div>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-4/5 mb-6 flex-grow" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </Card>
              ))}
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
                    className='h-full border border-slate-200 hover:border-blue-300 rounded-3xl p-2 transition-all shadow-sm hover:shadow-md'
                  >
                    <div className='flex flex-col h-full'>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="bg-slate-100 p-3 rounded-2xl text-slate-700">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className='text-xl font-bold text-slate-900 leading-tight'>
                          {dept}
                        </h3>
                      </div>
                      <p className='text-slate-600 text-sm mb-6 flex-grow leading-relaxed px-1'>
                        Explore textbooks and chat with AI-powered assistance dedicated to {dept}.
                      </p>
                      <div className="text-blue-600 font-semibold text-sm flex items-center gap-1 px-1">
                        Browse Books <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {!loading && departments.length === 0 && !error && (
            <div className='text-center py-16 bg-slate-50 rounded-3xl border border-slate-200'>
              <div className="flex justify-center mb-4 text-slate-400">
                <BookX className="w-12 h-12" />
              </div>
              <p className='text-lg font-medium text-slate-900 mb-1'>No departments available</p>
              <p className='text-sm text-slate-500'>Please check back later or contact an administrator.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}