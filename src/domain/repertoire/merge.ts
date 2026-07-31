import type { Chapter, RepertoireNode } from './types'

function mergeIds(a: string[], b: string[]): string[] {
  const merged = [...a]
  for (const id of b) {
    if (!merged.includes(id)) merged.push(id)
  }
  return merged
}

/**
 * Merges chapters that share a starting position and training colour into
 * one tree, so a branch point on the training side that happens to fall
 * across a chapter boundary (e.g. two White chapters both starting 1.d4)
 * becomes a normal in-tree choice instead of a forced pre-selection. Where
 * the same move sequence appears in more than one chapter, the first
 * chapter's annotations (comment/nags/shapes) win; children from every
 * chapter are combined. Callers must only pass chapters that already share
 * a starting position and colour — see groupAndMergeChapters.
 */
export function mergeChapters(chapters: Chapter[], name: string): Chapter {
  const { trainingColor, startingFen } = chapters[0]
  const nodes: Record<string, RepertoireNode> = {}
  let rootChildIds: string[] = []

  for (const chapter of chapters) {
    rootChildIds = mergeIds(rootChildIds, chapter.rootChildIds)
    for (const [id, node] of Object.entries(chapter.nodes)) {
      const existing = nodes[id]
      nodes[id] = existing
        ? { ...existing, childIds: mergeIds(existing.childIds, node.childIds) }
        : { ...node, childIds: [...node.childIds] }
    }
  }

  return { name, trainingColor, startingFen, rootChildIds, nodes }
}

/**
 * Groups chapters by starting position + training colour and merges each
 * group, since only chapters that begin from the same position for the same
 * side can share tree nodes. Chapters with a unique starting point (e.g. a
 * custom-FEN sideline) pass through unchanged.
 */
export function groupAndMergeChapters(chapters: Chapter[]): Chapter[] {
  const groups = new Map<string, Chapter[]>()
  for (const chapter of chapters) {
    const key = `${chapter.trainingColor}:${chapter.startingFen}`
    const group = groups.get(key)
    if (group) {
      group.push(chapter)
    } else {
      groups.set(key, [chapter])
    }
  }

  return [...groups.values()].map((group) =>
    group.length === 1 ? group[0] : mergeChapters(group, group.map((c) => c.name).join(' / ')),
  )
}
