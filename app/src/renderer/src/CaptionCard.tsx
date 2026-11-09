import { timecode } from './model'

interface Props {
  caption: { n: number; startMs: number; endMs: number } | null
  total: number
  words: string[]
  selWord: number | null
  /** Words that have their own look */
  styled: Set<number>
  fps: number
  onWord: (i: number) => void
}

/** The caption in view, under the preview: its timing and its words, ready to pick */
export function CaptionCard(p: Props) {
  return (
    <section className="capcard">
      <div className="phead"><b>This caption</b><span className="r">{p.caption ? `${p.caption.n} / ${p.total}` : ''}</span></div>
      {p.caption ? (
        <div className="capbody">
          <span className="captm">{timecode(p.caption.startMs, p.fps)} → {timecode(p.caption.endMs, p.fps)}</span>
          <div className="wchips">
            {p.words.map((w, i) => (
              <button key={i} className={(i === p.selWord ? 'on ' : '') + (p.styled.has(i) ? 'own' : '')} onClick={() => p.onWord(i)}>{w}</button>
            ))}
          </div>
          <p className="hint2">Click a word to give it its own look. Edit the text in the Caption tab.</p>
        </div>
      ) : <p className="hint2 pad">No caption here.</p>}
    </section>
  )
}
