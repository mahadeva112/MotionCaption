// A drop-down in the app's own look (rounded, dark, orange pick) in place of the system list.
// Written like a <select>: <option> and <optgroup> children, value, and onChange with the value.
import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Item = { value: string; label: string; title?: string; style?: CSSProperties; disabled?: boolean } | { group: string }
const isGroup = (i: Item): i is { group: string } => 'group' in i

const text = (n: ReactNode): string =>
  n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? '' : String(n)

/** <option> and <optgroup> children as a flat list */
function itemsOf(children: ReactNode): Item[] {
  const out: Item[] = []
  Children.toArray(children).forEach((c) => {
    if (!isValidElement<{ label?: string; value?: string | number; children?: ReactNode; title?: string; style?: CSSProperties; disabled?: boolean }>(c)) return
    if (c.type === 'optgroup') {
      const inner = itemsOf(c.props.children)
      if (inner.length) out.push({ group: c.props.label ?? '' }, ...inner)
    } else if (c.type === 'option') {
      const label = text(c.props.children)
      out.push({ value: String(c.props.value ?? label), label, title: c.props.title, style: c.props.style, disabled: c.props.disabled })
    }
  })
  return out
}

export function Dropdown({ value, onChange, className = 'sl', title, children }: {
  value: string | number; onChange: (v: string) => void; className?: string; title?: string; children: ReactNode
}) {
  const items = itemsOf(children)
  const opts = items.filter((i): i is Exclude<Item, { group: string }> => !isGroup(i))
  const cur = opts.find((o) => o.value === String(value)) ?? opts[0]
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1) // highlighted option, as an index in items
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties>({})
  const typed = useRef({ s: '', t: 0 })

  const show = () => {
    const at = items.findIndex((i) => !isGroup(i) && i.value === cur?.value)
    setHi(at)
    setOpen(true)
  }
  const pick = (i: number, byMouse: boolean) => {
    const it = items[i]
    if (!it || isGroup(it) || it.disabled) return
    setOpen(false)
    if (it.value !== String(value) || it.value === '') onChange(it.value)
    // After a mouse pick the app's keys (Space, arrows…) work again straight away
    if (byMouse) btn.current?.blur()
  }
  const move = (from: number, d: number) => {
    for (let i = from + d; i >= 0 && i < items.length; i += d) {
      const it = items[i]!
      if (!isGroup(it) && !it.disabled) return i
    }
    return from
  }

  // Under the button, or above it when there is no room; inside the window
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const below = innerHeight - r.bottom - 10, above = r.top - 10
    const up = below < 220 && above > below
    const maxHeight = Math.min(340, up ? above : below)
    const width = menu.current?.offsetWidth ?? r.width
    const left = Math.max(8, Math.min(r.left, innerWidth - Math.max(width, r.width) - 8))
    setPos({ left, minWidth: r.width, maxHeight, ...(up ? { bottom: innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
  }, [open])
  // Keep the highlighted one in view
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, hi])
  // Close on a click elsewhere, a scroll outside, a resize or leaving the window
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false) }
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [open])

  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key
    const stop = () => { e.preventDefault(); e.stopPropagation() }
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { stop(); show() }
      return
    }
    if (k === 'Escape' || k === 'Tab') { if (k === 'Escape') stop(); setOpen(false) }
    else if (k === 'ArrowDown') { stop(); setHi((h) => move(h, 1)) }
    else if (k === 'ArrowUp') { stop(); setHi((h) => move(h, -1)) }
    else if (k === 'Home') { stop(); setHi(move(-1, 1)) }
    else if (k === 'End') { stop(); setHi(move(items.length, -1)) }
    else if (k === 'Enter' || k === ' ') { stop(); pick(hi, false) }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type the first letters to jump (long lists like the fonts)
      stop()
      const now = Date.now()
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : '') + k.toLowerCase(), t: now }
      const s = typed.current.s
      const at = items.findIndex((i) => !isGroup(i) && !i.disabled && i.label.toLowerCase().startsWith(s))
      if (at >= 0) setHi(at)
    } else stop()
  }

  return (
    <>
      <button ref={btn} type="button" className={className + ' dd' + (open ? ' open' : '')} title={title}
        aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={key}>
        <span style={cur?.style}>{cur?.label ?? ''}</span>
        <svg className="ddc" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg>
      </button>
      {open && createPortal(
        <div ref={menu} className="ddm" role="listbox" style={pos}>
          {items.map((it, i) => isGroup(it)
            ? <div key={'g' + i} className="ddg">{it.group}</div>
            : (
              <div key={'o' + i} data-i={i} role="option" aria-selected={it.value === cur?.value} title={it.title} style={it.style}
                className={'ddo' + (it.value === cur?.value ? ' cur' : '') + (i === hi ? ' hi' : '') + (it.disabled ? ' off' : '')}
                onPointerEnter={() => setHi(i)} onClick={() => pick(i, true)}>
                {it.label}
              </div>
            ))}
        </div>,
        document.body,
      )}
    </>
  )
}
