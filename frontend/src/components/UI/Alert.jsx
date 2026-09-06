import React from 'react'
import { AlertCircle, CheckCircle2, Info, XCircle, X } from 'lucide-react'

export default function Alert({ variant = 'info', title, children, onClose, className = '' }) {
  const variants = {
    error: 'bg-red-50 border border-red-200 text-red-800',
    success: 'bg-green-50 border border-green-200 text-green-800',
    warning: 'bg-yellow-50 border border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border border-blue-200 text-blue-800'
  }

  const icons = {
    error: <XCircle className="w-5 h-5 text-red-500" />,
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />
  }

  return (
    <div className={`p-4 rounded-2xl ${variants[variant]} ${className}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex gap-3">
          <div className="flex-shrink-0 mt-0.5">{icons[variant]}</div>
          <div>
            {title && <h3 className="font-semibold">{title}</h3>}
            <div className={title ? 'mt-1 text-sm' : 'text-sm font-medium'}>
              {children}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}