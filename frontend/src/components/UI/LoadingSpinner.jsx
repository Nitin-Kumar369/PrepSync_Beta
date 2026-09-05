import React from 'react'

export default function LoadingSpinner({ size = 'md', className = '', label = 'Loading...' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-4',
    lg: 'w-12 h-12 border-4'
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className={`
          ${sizes[size]} border-gray-300 border-t-blue-600 rounded-full animate-spin
        `}
      />
      {label && <p className="text-gray-600 text-sm">{label}</p>}
    </div>
  )
}
