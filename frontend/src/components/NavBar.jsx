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
    <header className='bg-primary text-white shadow'>
      <div className='max-w-6xl mx-auto px-4'>
        <div className='flex items-center justify-between h-16'>
          <div className='flex items-center gap-4'>
            <Link to='/' className='text-xl font-semibold'>PrepSync</Link>
            <nav className='hidden md:flex gap-3 ml-6'>
              <Link to='/browse' className='px-3 py-2 rounded hover:bg-surface text-sm'>Books</Link>
              {user && <Link to='/account' className='px-3 py-2 rounded hover:bg-surface text-sm'>Account</Link>}
              {user?.role === 'admin' && <Link to='/admin' className='px-3 py-2 rounded hover:bg-surface text-sm'>Admin</Link>}
            </nav>
          </div>

          <div className='flex items-center gap-3'>
            <div className='hidden md:flex items-center gap-3'>
              {user ? (
                <>
                  <span className='text-sm muted'>{user.email}</span>
                  <Button variant='ghost' onClick={handleLogout}>Logout</Button>
                </>
              ) : (
                <>
                  <Link to='/login' className='text-sm px-3 py-2 rounded hover:bg-surface'>Login</Link>
                  <Link to='/signup' className='text-sm px-3 py-2 rounded bg-accent text-white'>Signup</Link>
                </>
              )}
            </div>

            <button className='md:hidden p-2 rounded hover:bg-surface' onClick={() => setOpen(!open)} aria-label='menu'>
              <svg xmlns='http://www.w3.org/2000/svg' className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className='md:hidden bg-primary/95'>
          <div className='px-4 py-3 space-y-2'>
            <Link to='/browse' className='block px-3 py-2 rounded text-white'>Books</Link>
            {user && <Link to='/account' className='block px-3 py-2 rounded text-white'>Account</Link>}
            {user?.role === 'admin' && <Link to='/admin' className='block px-3 py-2 rounded text-white'>Admin</Link>}
            {user ? (
              <button onClick={handleLogout} className='w-full text-left px-3 py-2 rounded text-white'>Logout</button>
            ) : (
              <>
                <Link to='/login' className='block px-3 py-2 rounded text-white'>Login</Link>
                <Link to='/signup' className='block px-3 py-2 rounded bg-accent text-white'>Signup</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
