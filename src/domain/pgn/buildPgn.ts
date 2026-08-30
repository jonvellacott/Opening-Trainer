import { STANDARD_STARTING_FEN } from '../chess'

export interface MoveRow {
  number: number
  white?: string
  black?: string
}

function movesToPgnText(rows: MoveRow[]): string {
  return rows
    .map((row) =>
      row.white ? `${row.number}. ${row.white}${row.black ? ` ${row.black}` : ''}` : `${row.number}... ${row.black}`,
    )
    .join(' ')
}

/**
 * Renders a played line as PGN, for pasting elsewhere (a Lichess study,
 * chess.com analysis, a coach). Adds FEN/SetUp tags when the line doesn't
 * start from the standard position; the trailing `*` is PGN's marker for an
 * unfinished/unknown result, since these aren't real games.
 */
export function buildPgn(rootFen: string, rows: MoveRow[]): string {
  const moveText = [movesToPgnText(rows), '*'].filter(Boolean).join(' ')
  if (rootFen === STANDARD_STARTING_FEN) return moveText
  return `[FEN "${rootFen}"]\n[SetUp "1"]\n\n${moveText}`
}
