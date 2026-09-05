import React from 'react'

export default function Card({
  children,
  header,
  footer,
  className = '',
  onClick,
  hoverable = false,
}) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden
        ${hoverable ? 'hover:shadow-md hover:border-gray-300 cursor-pointer transition-all duration-200' : ''}
        ${className}
      `}
    >
      {header && (
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          {header}
        </div>
      )}
      <div className="px-6 py-4">
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          {footer}
        </div>
      )}
    </div>
  )
}
