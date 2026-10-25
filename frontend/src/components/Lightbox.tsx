import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconBack, IconChevron, IconX } from './Icons'
import { Overlay } from './ui'
import type { Swatch } from '../data'

export interface LightboxItem { swatch: Swatch; label: string; caption?: string; art?: ReactNode; image?: string }

/** Full-screen viewer for panels and story photos. Arrow keys, swipe and Esc all work. */
export function Lightbox({ title, items, start = 0, onClose }: { title: string; items: LightboxItem[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const touchX = useRef<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const go = (d: number) => setI(v => (v + d + items.length) % items.length)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = items[i]!
  return (
    <Overlay>
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
        <div className="lightbox-inner" onClick={e => e.stopPropagation()}
          onTouchStart={e => { touchX.current = e.touches[0]!.clientX }}
          onTouchEnd={e => {
            if (touchX.current === null) return
            const dx = e.changedTouches[0]!.clientX - touchX.current
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
            touchX.current = null
          }}>
          <div className="lightbox-head">
            <span className="lightbox-title">{title}</span>
            <button ref={closeRef} className="icon-btn light" aria-label="Close" onClick={onClose}><IconX /></button>
          </div>
          <div key={i} className={`lightbox-stage ht c-${item.swatch}`}>
            {item.image ? <img className="lightbox-photo" src={item.image} alt={item.label} /> : item.art}
            {!item.image && <span className="photo-tag">[{item.label}]</span>}
          </div>
          {item.caption && <p className="lightbox-caption">{item.caption}</p>}
          {items.length > 1 && (
            <div className="lightbox-nav">
              <button className="icon-btn light" aria-label="Previous" onClick={() => go(-1)}><IconBack /></button>
              <div className="lightbox-dots">
                {items.map((_, j) => <button key={j} aria-label={`Photo ${j + 1}`} className={j === i ? 'on' : ''} onClick={() => setI(j)} />)}
              </div>
              <button className="icon-btn light" aria-label="Next" onClick={() => go(1)}><IconChevron /></button>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  )
}
