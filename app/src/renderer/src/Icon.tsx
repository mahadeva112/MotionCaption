// Small line icons for buttons (stroke follows the text colour)
const PATHS = {
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  undo: 'M4 9h11a5 5 0 0 1 0 10H8M8 5 4 9l4 4',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  prev: 'M6 5v14M19 5 9 12l10 7z',
  next: 'M18 5v14M5 5l10 7-10 7z',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  const solid = name === 'play'
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={solid ? 'currentColor' : 'none'} stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={name === 'pause' ? 3 : 1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
