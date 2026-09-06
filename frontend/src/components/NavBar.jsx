import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import Button from './UI/Button'
import { Sun, Moon, Menu, X } from 'lucide-react'

export default function NavBar() {
  const { user, logout } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className='bg-white text-slate-900 shadow-sm border-b border-slate-200 sticky top-0 z-50 transition-colors'>
      <div className='max-w-6xl mx-auto px-4'>
        <div className='flex items-center justify-between h-16'>
          <div className='flex items-center gap-4'>
            <Link to='/' className='text-2xl font-bold text-blue-600'>PrepSync</Link>
            <nav className='hidden md:flex gap-1 ml-6'>
              <Link to='/browse' className='px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-blue-600 font-medium text-sm transition-colors'>Books</Link>
              {user && <Link to='/account' className='px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-blue-600 font-medium text-sm transition-colors'>Account</Link>}
              {user?.role === 'admin' && <Link to='/admin' className='px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-blue-600 font-medium text-sm transition-colors'>Admin</Link>}
            </nav>
          </div>

          <div className='flex items-center gap-2'>
            {/* Dark Mode Toggle */}
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors mr-2"
              aria-label="Toggle Dark Mode"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className='hidden md:flex items-center gap-4'>
              {user ? (
                <>
                  <span className='text-sm text-slate-500 font-medium'>{user.email}</span>
                  <Button variant='secondary' onClick={handleLogout} className="rounded-full">Logout</Button>
                </>
              ) : (
                <>
                  <Link to='/login' className='text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors'>Log in</Link>
                  <Link to='/signup'>
                    <Button variant='primary' className="rounded-full">Sign up</Button>
                  </Link>
                </>
              )}
            </div>

            <button className='md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600' onClick={() => setOpen(!open)} aria-label='menu'>
              {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className='md:hidden bg-white border-t border-slate-100 shadow-lg absolute w-full transition-colors'>
          <div className='px-4 py-3 space-y-2'>
            <Link to='/browse' className='block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-medium'>Books</Link>
            {user && <Link to='/account' className='block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-medium'>Account</Link>}
            {user?.role === 'admin' && <Link to='/admin' className='block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-medium'>Admin</Link>}
            {user ? (
              <button onClick={handleLogout} className='w-full text-left px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 font-medium'>Logout</button>
            ) : (
              <div className='pt-2 border-t border-slate-100 flex flex-col gap-2'>
                <Link to='/login' className='block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 text-center font-medium border border-slate-200'>Log in</Link>
                <Link to='/signup' className='block px-3 py-2 rounded-lg bg-blue-600 text-white text-center font-medium'>Sign up</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}