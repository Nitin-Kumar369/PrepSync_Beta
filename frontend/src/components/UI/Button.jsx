import React from 'react'

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center px-4 py-2 rounded-md font-medium focus:outline-none'
  const variants = {
    primary: 'bg-accent text-white hover:bg-blue-700',
    secondary: 'bg-white border border-gray-200 text-primary hover:bg-gray-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent text-primary hover:bg-gray-50'
  }
  const classes = [base, variants[variant] || variants.primary, className].filter(Boolean).join(' ')
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
