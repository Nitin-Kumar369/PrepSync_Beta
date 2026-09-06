import React from 'react'

export default function Skeleton({ className = '', variant = 'rectangular' }) {
  const variants = {
    rectangular: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded-md'
  }

  return (
    <div className={`animate-pulse bg-slate-200 ${variants[variant]} ${className}`} />
  )
}