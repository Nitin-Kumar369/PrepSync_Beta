import React from 'react'

export default function Alert({ variant = 'info', title, children, onClose, className = '' }) {
  const variants = {
    error: 'bg-red-50 border-l-4 border-red-400 text-red-700',
    success: 'bg-green-50 border-l-4 border-green-400 text-green-700',
    warning: 'bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700',
    info: 'bg-blue-50 border-l-4 border-blue-400 text-blue-700'
  }

  const icons = {
    error: '❌',
    success: '✅',
    warning: '⚠️',
    info: 'ℹ️'
  }

  return (
    <div className={`p-4 rounded ${variants[variant]} ${className}`}>
      <div className="flex justify-between items-start">
        <div>
          {title && <h3 className="font-semibold flex items-center gap-2">{icons[variant]} {title}</h3>}
          <p className={title ? 'mt-1 text-sm' : 'flex items-center gap-2'}>
            {!title && icons[variant]}
            {children}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xl hover:opacity-70 ml-2"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
