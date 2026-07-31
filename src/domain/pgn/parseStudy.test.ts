import { describe, expect, it } from 'vitest'
import { PgnImportError, parseStudyPgn } from './parseStudy'

describe('parseStudyPgn', () => {
  it('builds a tree with a mainline and a variation', () => {
    const pgn = `[Event "Test"]
[ChapterName "Main"]

1. e4 e5 2. Nf3 (2. Bc4 Nc6) 2... Nc6 *`

    const repertoire = parseStudyPgn(pgn, 'white')
    const chapter = repertoire.chapters[0]

    expect(chapter.name).toBe('Main')
    expect(chapter.rootChildIds).toEqual(['e4'])
    expect(chapter.nodes['e4'].childIds).toEqual(['e4/e5'])
    expect(chapter.nodes['e4/e5'].childIds).toEqual(['e4/e5/Nf3', 'e4/e5/Bc4'])
    expect(chapter.nodes['e4/e5/Nf3'].childIds).toEqual(['e4/e5/Nf3/Nc6'])
    expect(chapter.nodes['e4/e5/Bc4'].childIds).toEqual(['e4/e5/Bc4/Nc6'])
    expect(chapter.nodes['e4'].color).toBe('white')
    expect(chapter.nodes['e4/e5'].color).toBe('black')
  })

  it('handles variations nested several levels deep', () => {
    const pgn = `[Event "Test"]

1. d4 d5 2. Bf4 (2. Nc3 Nf6 3. Bf4 Nc6 (3... Bf5 4. f3) 4. Nb5) 2... Nf6 *`

    const chapter = parseStudyPgn(pgn, 'white').chapters[0]

    // Mainline continues past the top-level variation.
    expect(chapter.nodes['d4/d5/Bf4'].childIds).toEqual(['d4/d5/Bf4/Nf6'])
    // "(3... Bf5 ...)" is an alternative to Nc6, so it's a sibling of Nc6 under Bf4,
    // not a child of it — variations replace the move they follow, branching from
    // that move's parent.
    expect(chapter.nodes['d4/d5/Nc3/Nf6/Bf4'].childIds).toEqual([
      'd4/d5/Nc3/Nf6/Bf4/Nc6',
      'd4/d5/Nc3/Nf6/Bf4/Bf5',
    ])
    expect(chapter.nodes['d4/d5/Nc3/Nf6/Bf4/Nc6'].childIds).toEqual([
      'd4/d5/Nc3/Nf6/Bf4/Nc6/Nb5',
    ])
    expect(chapter.nodes['d4/d5/Nc3/Nf6/Bf4/Bf5'].childIds).toEqual([
      'd4/d5/Nc3/Nf6/Bf4/Bf5/f3',
    ])
  })

  it('captures comments, NAGs, and cal/csl shapes', () => {
    const pgn = `[Event "Test"]

1. e4 $1 {best by test} e5 2. Nf3 {developing [%cal Gf1c4,Rc4f7] [%csl Re5]} Nc6 *`

    const chapter = parseStudyPgn(pgn, 'white').chapters[0]

    expect(chapter.nodes['e4'].nags).toEqual(['$1'])
    expect(chapter.nodes['e4'].comment).toBe('best by test')
    expect(chapter.nodes['e4/e5/Nf3'].comment).toBe('developing')
    expect(chapter.nodes['e4/e5/Nf3'].shapes).toEqual({
      arrows: ['Gf1c4', 'Rc4f7'],
      squares: ['Re5'],
    })
  })

  it('parses each game in a multi-chapter study as a separate chapter', () => {
    const pgn = `[Event "One"]
[ChapterName "Chapter One"]

1. d4 *

[Event "Two"]
[ChapterName "Chapter Two"]

1. e4 *`

    const repertoire = parseStudyPgn(pgn, 'white')

    expect(repertoire.chapters).toHaveLength(2)
    expect(repertoire.chapters[0].name).toBe('Chapter One')
    expect(repertoire.chapters[1].name).toBe('Chapter Two')
  })

  it('respects a custom starting FEN', () => {
    const pgn = `[Event "Custom start"]
[SetUp "1"]
[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]

2. Nf3 *`

    const chapter = parseStudyPgn(pgn, 'white').chapters[0]

    expect(chapter.startingFen).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    )
    expect(chapter.nodes['Nf3'].san).toBe('Nf3')
  })

  it('assigns the given training colour to every chapter', () => {
    const pgn = `[Event "Test"]\n\n1. e4 *`
    expect(parseStudyPgn(pgn, 'black').chapters[0].trainingColor).toBe('black')
  })

  it('throws a PgnImportError for an illegal move', () => {
    const pgn = `[Event "Illegal"]\n\n1. e5 *`
    expect(() => parseStudyPgn(pgn, 'white')).toThrow(PgnImportError)
  })
})
