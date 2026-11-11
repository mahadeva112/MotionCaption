import { useRef, type PointerEvent } from 'react'
import { EASE, type Bezier } from '@core/anim'

// A speed curve to draw by hand: time runs left to right, the move from bottom to top.
// The two handles are the curve's control points (CSS cubic-bezier, the same handles
// Resolve's keyframes get). Above the top it overshoots, below the bottom it pulls back.

const W = 136
const H = 100
const PAD = 10
const Y_MIN = -0.5
const Y_MAX = 1.5
const px = (x: number) => PAD + x * (W - 2 * PAD)
const py = (y: number) => PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * (H - 2 * PAD)

/** Ready-made curves; the first keeps each animation's own */
export const CURVES: [string, Bezier | undefined][] = [
  ['As designed', undefined], ['Smooth', EASE.inOut], ['Soft stop', EASE.out], ['Speed up', EASE.in], ['Overshoot', EASE.back], ['Even', EASE.linear],
]

const same = (a: Bezier | undefined, b: Bezier | undefined) => (!a || !b ? a === b : a.every((v, i) => Math.abs(v - b[i]!) < 0.005))
const r2 = (v: number) => Math.round(v * 100) / 100

interface Props {
  label: string
  /** The curve, or unset for each animation's own */
  value: Bezier | undefined
  /** Drawn (faint) while the value is unset; dragging starts from it */
  typical: Bezier
  onChange: (b: Bezier | undefined) => void
}

export function CurveEdit({ label, value, typical, onChange }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const grab = useRef<0 | 1 | null>(null)
  const b = value ?? typical
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (grab.current === null || !svg.current) return
    const r = svg.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (((e.clientX - r.left) / r.width) * W - PAD) / (W - 2 * PAD)))
    const y = Math.min(Y_MAX, Math.max(Y_MIN, Y_MAX - ((((e.clientY - r.top) / r.height) * H - PAD) / (H - 2 * PAD)) * (Y_MAX - Y_MIN)))
    const next = [...b] as [number, number, number, number]
    next[grab.current * 2] = r2(x)
    next[grab.current * 2 + 1] = r2(y)
    onChange(next)
  }
  const handle = (i: 0 | 1) => (e: PointerEvent<SVGCircleElement>) => {
    grab.current = i
    svg.current?.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }
  const [x1, y1, x2, y2] = b
  return (
    <div className="curve">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={value ? 'own' : ''}
        onPointerMove={move} onPointerUp={() => { grab.current = null }} onPointerCancel={() => { grab.current = null }}>
        <rect className="cv-box" x={px(0)} y={py(1)} width={px(1) - px(0)} height={py(0) - py(1)} />
        <line className="cv-arm" x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} />
        <line className="cv-arm" x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} />
        <path className="cv-line" d={`M${px(0)},${py(0)} C${px(x1)},${py(y1)} ${px(x2)},${py(y2)} ${px(1)},${py(1)}`} />
        <circle className="cv-dot" cx={px(x1)} cy={py(y1)} r={5} onPointerDown={handle(0)} />
        <circle className="cv-dot" cx={px(x2)} cy={py(y2)} r={5} onPointerDown={handle(1)} />
      </svg>
      <div className="cv-side">
        <b>{label}</b>
        <div className="cv-picks">
          {CURVES.map(([name, c]) => (
            <button key={name} className={same(value, c) ? 'on' : ''} onClick={() => onChange(c)}>{name}</button>
          ))}
        </div>
        <small>{value ? `cubic-bezier(${value.join(', ')})` : 'Drag a dot to make your own'}</small>
      </div>
    </div>
  )
}
