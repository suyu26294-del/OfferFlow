'use client'
import { useRef, useCallback } from 'react'

/**
 * GlowCard — dark-mode panel with a mouse-following spotlight.
 *
 * Usage:
 *   <GlowCard className="p-5">
 *     <p>Your content</p>
 *   </GlowCard>
 *
 * The glow tracks the cursor position via CSS custom properties.
 * Only renders the glow layer in dark mode (harmless no-op in light).
 */
export default function GlowCard({ children, className = '', as: Tag = 'div', ...props }) {
  const cardRef = useRef(null)

  const handleMouseMove = useCallback((e) => {
    const rect = cardRef.current.getBoundingClientRect()
    cardRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
    cardRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
  }, [])

  const handleMouseLeave = useCallback(() => {
    // Optionally reset the glow position so it doesn't stick on hover-out
    cardRef.current.style.setProperty('--mouse-x', '50%')
    cardRef.current.style.setProperty('--mouse-y', '50%')
  }, [])

  return (
    <Tag
      ref={cardRef}
      className={`glow-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <div className="glow-effect" />
      <div className="glow-content">{children}</div>
    </Tag>
  )
}
