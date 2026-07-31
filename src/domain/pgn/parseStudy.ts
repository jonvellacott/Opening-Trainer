import { parseGames } from '@mliebelt/pgn-parser'
import type { PgnMove, Tags } from '@mliebelt/pgn-types'
import { applySanMove, STANDARD_STARTING_FEN } from '../chess'
import type { Chapter, Color, Repertoire, RepertoireNode } from '../repertoire/types'

export class PgnImportError extends Error {}

// Lichess-specific tags (ChapterName, StudyName, ChapterURL) aren't part of the
// parser's known tag set, so they fall outside the typed Tags shape.
function getTag(tags: Tags | undefined, key: string): string | undefined {
  return tags ? (tags as unknown as Record<string, string | undefined>)[key] : undefined
}

/**
 * Walks one line of moves, recursing into variations. A variation branches from
 * the position *before* the move it attaches to, so it's processed using the
 * parent state captured at the start of that iteration, before the loop
 * advances to the next mainline move.
 */
function buildLine(
  moves: PgnMove[],
  parentId: string | null,
  parentFen: string,
  parentPath: readonly string[],
  nodes: Record<string, RepertoireNode>,
  chapterLabel: string,
): string[] {
  const topLevelIds: string[] = []
  let currentParentId = parentId
  let currentFen = parentFen
  let currentPath = parentPath

  for (const move of moves) {
    const applied = applySanMove(currentFen, move.notation.notation)
    if (!applied) {
      throw new PgnImportError(
        `Illegal move "${move.notation.notation}" in chapter "${chapterLabel}"`,
      )
    }

    const nodePath = [...currentPath, applied.san]
    const id = nodePath.join('/')

    nodes[id] = {
      id,
      parentId: currentParentId,
      childIds: [],
      ply: nodePath.length,
      color: move.turn === 'w' ? 'white' : 'black',
      san: applied.san,
      fen: applied.fen,
      comment: move.commentAfter,
      nags: move.nag && move.nag.length > 0 ? move.nag : undefined,
      shapes: move.commentDiag
        ? {
            arrows: move.commentDiag.colorArrows ?? [],
            squares: move.commentDiag.colorFields ?? [],
          }
        : undefined,
    }

    if (currentParentId !== null) {
      nodes[currentParentId].childIds.push(id)
    } else {
      topLevelIds.push(id)
    }

    if (move.variations) {
      for (const variation of move.variations) {
        const variationIds = buildLine(
          variation,
          currentParentId,
          currentFen,
          currentPath,
          nodes,
          chapterLabel,
        )
        if (currentParentId === null) {
          topLevelIds.push(...variationIds)
        }
      }
    }

    currentParentId = id
    currentFen = applied.fen
    currentPath = nodePath
  }

  return topLevelIds
}

function buildChapter(game: { tags?: Tags; moves: PgnMove[] }, trainingColor: Color): Chapter {
  const name = getTag(game.tags, 'ChapterName') ?? getTag(game.tags, 'Event') ?? 'Untitled chapter'
  const startingFen = getTag(game.tags, 'FEN') ?? STANDARD_STARTING_FEN
  const nodes: Record<string, RepertoireNode> = {}

  const rootChildIds = buildLine(game.moves, null, startingFen, [], nodes, name)

  return { name, trainingColor, startingFen, rootChildIds, nodes }
}

/** Parses a Lichess Study PGN export (one chapter per game) into a Repertoire. */
export function parseStudyPgn(pgnText: string, trainingColor: Color): Repertoire {
  let games
  try {
    games = parseGames(pgnText)
  } catch (err) {
    throw new PgnImportError(`Could not parse PGN: ${(err as Error).message}`)
  }

  if (games.length === 0) {
    throw new PgnImportError('No chapters found in PGN')
  }

  const chapters = games.map((game) => buildChapter(game, trainingColor))
  const name = getTag(games[0].tags, 'StudyName') ?? 'Untitled repertoire'

  return { name, chapters }
}
