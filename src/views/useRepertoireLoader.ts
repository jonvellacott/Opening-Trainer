import { useState } from 'react'
import { parseStudyPgn, PgnImportError } from '../domain/pgn'
import type { Color, Repertoire } from '../domain/repertoire'

function extractStudyId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/lichess\.org\/study\/([A-Za-z0-9]+)/)
  return match ? match[1] : trimmed
}

export function useRepertoireLoader() {
  const [repertoire, setRepertoire] = useState<Repertoire | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(studyInput: string, trainingColor: Color) {
    setLoading(true)
    setError(null)
    setRepertoire(null)
    try {
      const studyId = extractStudyId(studyInput)
      const response = await fetch(`https://lichess.org/api/study/${studyId}.pgn`)
      if (!response.ok) {
        throw new Error(`Lichess returned ${response.status}`)
      }
      const pgnText = await response.text()
      setRepertoire(parseStudyPgn(pgnText, trainingColor))
    } catch (err) {
      const message =
        err instanceof PgnImportError || err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return { repertoire, error, loading, load }
}
