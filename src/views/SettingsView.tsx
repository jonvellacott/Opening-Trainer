import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getFamily, updateSuggestionThreshold } from '../lib/familiesRepo'
import { importChessComPlayer, importLichessPlayer } from '../lib/gameStatsImport'
import type { ImportProgress } from '../lib/gameStatsImport'
import { saveMoveStats } from '../lib/moveStatsRepo'
import {
  createTrackedPlayer,
  deleteTrackedPlayer,
  listTrackedPlayers,
  markImported,
} from '../lib/trackedPlayersRepo'
import type { PlayerSource, TrackedPlayerRow } from '../lib/trackedPlayersRepo'

function ThresholdSetting({ familyId }: { familyId: string }) {
  const [value, setValue] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getFamily(familyId)
      .then((f) => setValue(String(f.suggestion_threshold_percent)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [familyId])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const percent = Number(value)
    if (value === null || Number.isNaN(percent) || percent < 0 || percent > 100) {
      setError('Enter a number between 0 and 100.')
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await updateSuggestionThreshold(familyId, percent)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Suggestion threshold</h2>
      <p style={{ color: '#888' }}>
        Moves played less often than this share of games aren't shown as suggestions in Build mode —
        applies to Masters, the Lichess database, and tracked streamers alike.
      </p>
      {value === null ? (
        <p>Loading…</p>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
            style={{ width: 80 }}
          />
          <span>%</span>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ color: '#888', fontSize: '0.85rem' }}>Saved</span>}
        </form>
      )}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}

/** Repertoire prep essentially never goes deeper than this — keeps imports from filling up with irrelevant middlegame positions. */
const MAX_IMPORT_PLIES = 20

interface ImportState {
  progress?: ImportProgress
  error?: string
}

function formatLastImported(iso: string | null): string {
  if (!iso) return 'Never imported'
  return `Imported ${new Date(iso).toLocaleString()}`
}

function TrackedPlayerCard({
  player,
  importState,
  onImport,
  onDelete,
}: {
  player: TrackedPlayerRow
  importState: ImportState | undefined
  onImport: () => void
  onDelete: () => void
}) {
  const importing = importState !== undefined && importState.error === undefined

  return (
    <div style={{ border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div>
          <strong>{player.username}</strong>{' '}
          <span style={{ color: '#888', fontSize: '0.85rem' }}>({player.source})</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={onImport} disabled={importing}>
            {player.last_imported_at ? 'Refresh' : 'Import'}
          </button>
          <button type="button" onClick={onDelete} disabled={importing}>
            Remove
          </button>
        </div>
      </div>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#888' }}>
        {formatLastImported(player.last_imported_at)}
      </p>
      {importState?.progress && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
          {importState.progress.gamesProcessed.toLocaleString()} games processed…
        </p>
      )}
      {importState?.error && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'crimson' }}>
          Import failed: {importState.error}
        </p>
      )}
    </div>
  )
}

export function SettingsView({ familyId }: { familyId: string }) {
  const [players, setPlayers] = useState<TrackedPlayerRow[] | null>(null)
  const [source, setSource] = useState<PlayerSource>('chess.com')
  const [username, setUsername] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({})

  useEffect(() => {
    listTrackedPlayers(familyId)
      .then(setPlayers)
      .catch((err) => setFormError(err instanceof Error ? err.message : String(err)))
  }, [familyId])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      const player = await createTrackedPlayer({ familyId, source, username: username.trim() })
      setPlayers((prev) => [...(prev ?? []), player])
      setUsername('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string) {
    await deleteTrackedPlayer(id)
    setPlayers((prev) => (prev ?? []).filter((p) => p.id !== id))
  }

  async function handleImport(player: TrackedPlayerRow) {
    setImportStates((prev) => ({ ...prev, [player.id]: {} }))

    const importPlayer = player.source === 'chess.com' ? importChessComPlayer : importLichessPlayer

    try {
      const rows = await importPlayer(player.username, MAX_IMPORT_PLIES, (progress) => {
        setImportStates((prev) => ({ ...prev, [player.id]: { progress } }))
      })
      await saveMoveStats(rows)
      await markImported(player.id)
      setPlayers((prev) =>
        (prev ?? []).map((p) =>
          p.id === player.id ? { ...p, last_imported_at: new Date().toISOString() } : p,
        ),
      )
      setImportStates((prev) => {
        const next = { ...prev }
        delete next[player.id]
        return next
      })
    } catch (err) {
      setImportStates((prev) => ({
        ...prev,
        [player.id]: { error: err instanceof Error ? err.message : String(err) },
      }))
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 640, margin: '2rem auto' }}>
      <ThresholdSetting familyId={familyId} />
      <h2>Tracked players</h2>
      <p style={{ color: '#888' }}>
        Accounts whose games feed move suggestions in Build mode. Each one needs an import before its
        moves show up (pulls its full public game history — can take a while for very active accounts),
        and again later to refresh with newer games.
      </p>

      {players === null && <p>Loading…</p>}
      {players && players.length === 0 && <p style={{ color: '#888' }}>No tracked players yet.</p>}
      {players && players.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {players.map((player) => (
            <TrackedPlayerCard
              key={player.id}
              player={player}
              importState={importStates[player.id]}
              onImport={() => handleImport(player)}
              onDelete={() => handleDelete(player.id)}
            />
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem' }}>
        <select value={source} onChange={(e) => setSource(e.target.value as PlayerSource)}>
          <option value="chess.com">Chess.com</option>
          <option value="lichess">Lichess</option>
        </select>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          style={{ flex: 1 }}
        />
        <button type="submit">Add</button>
      </form>
      {formError && <p style={{ color: 'crimson' }}>{formError}</p>}
    </div>
  )
}
