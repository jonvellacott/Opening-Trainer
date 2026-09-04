import { formatEval } from '../lib/localStockfish'
import type { EngineLine } from '../lib/localStockfish'

/**
 * Maps a white-relative score to a 0-100 "how much of the bar is white"
 * percentage, using the same saturating-sigmoid shape Lichess's eval bar
 * uses — most of the scale is spent on the +-3 pawn range that matters,
 * while huge material swings still cap out near the ends instead of
 * pinning the bar at 0/100 the moment either side is up a queen.
 */
function evalToWhitePercent(line: EngineLine | null): number {
  if (!line) return 50
  if (line.mate !== undefined) return line.mate > 0 ? 100 : 0
  const cp = line.cp ?? 0
  const percent = 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1)
  return Math.min(100, Math.max(0, percent))
}

/** A vertical eval bar, like Lichess/chess.com's, sized to fill its flex container. */
export function EvalBar({
  line,
  boardOrientation,
  isBad,
}: {
  line: EngineLine | null
  boardOrientation: 'white' | 'black'
  isBad?: boolean
}) {
  const whitePercent = evalToWhitePercent(line)
  const whiteAtBottom = boardOrientation === 'white'
  const labelOnWhiteSide = whitePercent >= 50

  return (
    <div
      style={{
        width: 18,
        alignSelf: 'stretch',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 3,
        background: '#3a3a3a',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          [whiteAtBottom ? 'bottom' : 'top']: 0,
          height: `${whitePercent}%`,
          background: '#eee',
          transition: 'height 0.3s ease',
        }}
      />
      {line && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            [labelOnWhiteSide === whiteAtBottom ? 'bottom' : 'top']: 2,
            textAlign: 'center',
            fontSize: '0.6rem',
            fontWeight: 600,
            color: isBad ? 'crimson' : labelOnWhiteSide ? '#222' : '#eee',
          }}
        >
          {formatEval(line)}
        </span>
      )}
    </div>
  )
}
