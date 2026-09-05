import React from 'react'

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  closeButton = true
}) {
  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={`
            bg-white rounded-xl shadow-lg ${sizes[size]} w-full max-h-[90vh] overflow-auto
            animate-in fade-in-0 zoom-in-95 duration-200
          `}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            {closeButton && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl font-light transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {children}
          </div>

          {/* Actions */}
          {actions && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 justify-end">
              {actions}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
