import { describe, expect, it } from 'vitest'
import { parseStudyPgn } from '../pgn'
import { groupAndMergeChapters } from './merge'

describe('groupAndMergeChapters', () => {
  it('merges chapters that share a starting position into one tree', () => {
    const pgn = `[Event "One"]
[ChapterName "London"]

1. d4 d5 2. Bf4 *

[Event "Two"]
[ChapterName "Jobava"]

1. d4 d5 2. Nc3 *`

    const { chapters } = parseStudyPgn(pgn, 'white')
    const [merged] = groupAndMergeChapters(chapters)

    expect(groupAndMergeChapters(chapters)).toHaveLength(1)
    expect(merged.name).toBe('London / Jobava')
    expect(merged.rootChildIds).toEqual(['d4'])
    expect(merged.nodes['d4/d5'].childIds).toEqual(['d4/d5/Bf4', 'd4/d5/Nc3'])
  })

  it('leaves chapters with different starting positions ungrouped', () => {
    const pgn = `[Event "Standard"]

1. e4 *

[Event "Sideline"]
[SetUp "1"]
[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]

2. Nf3 *`

    const { chapters } = parseStudyPgn(pgn, 'white')

    expect(groupAndMergeChapters(chapters)).toHaveLength(2)
  })

  it('passes a lone chapter through unchanged', () => {
    const pgn = `[Event "Solo"]\n[ChapterName "Solo"]\n\n1. e4 *`
    const { chapters } = parseStudyPgn(pgn, 'white')
    const [result] = groupAndMergeChapters(chapters)

    expect(result).toBe(chapters[0])
  })
})
