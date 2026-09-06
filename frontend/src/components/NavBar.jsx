import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Button from './UI/Button'

export default function NavBar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className='bg-white text-gray-900 shadow-sm border-b border-gray-200 sticky top-0 z-50'>
      <div className='max-w-6xl mx-auto px-4'>
        <div className='flex items-center justify-between h-16'>
          <div className='flex items-center gap-4'>
            <Link to='/' className='text-2xl font-bold text-blue-600'>PrepSync</Link>
            <nav className='hidden md:flex gap-1 ml-6'>
              <Link to='/browse' className='px-3 py-2 rounded-md hover:bg-blue-50 hover:text-blue-600 font-medium text-sm transition-colors'>Books</Link>
              {user && <Link to='/account' className='px-3 py-2 rounded-md hover:bg-blue-50 hover:text-blue-600 font-medium text-sm transition-colors'>Account</Link>}
              {user?.role === 'admin' && <Link to='/admin' className='px-3 py-2 rounded-md hover:bg-blue-50 hover:text-blue-600 font-medium text-sm transition-colors'>Admin</Link>}
            </nav>
          </div>

          <div className='flex items-center gap-3'>
            <div className='hidden md:flex items-center gap-4'>
              {user ? (
                <>
                  <span className='text-sm text-gray-600 font-medium'>{user.email}</span>
                  <Button variant='secondary' onClick={handleLogout}>Logout</Button>
                </>
              ) : (
                <>
                  <Link to='/login' className='text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors'>Log in</Link>
                  <Link to='/signup'>
                    <Button variant='primary'>Sign up</Button>
                  </Link>
                </>
              )}
            </div>

            <button className='md:hidden p-2 rounded-md hover:bg-gray-100 text-gray-600' onClick={() => setOpen(!open)} aria-label='menu'>
              <svg xmlns='http://www.w3.org/2000/svg' className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className='md:hidden bg-white border-t border-gray-100 shadow-lg absolute w-full'>
          <div className='px-4 py-3 space-y-2'>
            <Link to='/browse' className='block px-3 py-2 rounded-md text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-medium'>Books</Link>
            {user && <Link to='/account' className='block px-3 py-2 rounded-md text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-medium'>Account</Link>}
            {user?.role === 'admin' && <Link to='/admin' className='block px-3 py-2 rounded-md text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-medium'>Admin</Link>}
            {user ? (
              <button onClick={handleLogout} className='w-full text-left px-3 py-2 rounded-md text-red-600 hover:bg-red-50 font-medium'>Logout</button>
            ) : (
              <div className='pt-2 border-t border-gray-100 flex flex-col gap-2'>
                <Link to='/login' className='block px-3 py-2 rounded-md text-gray-700 hover:bg-gray-50 text-center font-medium border border-gray-200'>Log in</Link>
                <Link to='/signup' className='block px-3 py-2 rounded-md bg-blue-600 text-white text-center font-medium'>Sign up</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}