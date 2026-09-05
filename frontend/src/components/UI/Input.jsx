import React from 'react'

export default function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  type = 'text',
  disabled = false,
  required = false,
  className = '',
  ...props
}) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`
          w-full px-4 py-2 border rounded-lg font-base focus:outline-none focus:ring-2 transition-colors duration-200
          ${error 
            ? 'border-red-500 focus:ring-red-500 bg-red-50' 
            : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400'
          }
          ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
          ⚠️ {error}
        </p>
      )}
    </div>
  )
}
