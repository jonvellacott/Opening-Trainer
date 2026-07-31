import type { Chapter, Color, RepertoireNode } from './types'

/** Pass nodeId=null to get the chapter's first moves. */
export function getChildren(chapter: Chapter, nodeId: string | null): RepertoireNode[] {
  const ids = nodeId === null ? chapter.rootChildIds : chapter.nodes[nodeId].childIds
  return ids.map((id) => chapter.nodes[id])
}

/** Colour to move next, or null if nodeId is a leaf (end of the line). */
export function nextMoveColor(chapter: Chapter, nodeId: string | null): Color | null {
  const children = getChildren(chapter, nodeId)
  return children.length > 0 ? children[0].color : null
}

/** The child whose move matches the given SAN, if the move is in the repertoire. */
export function findMatchingChild(
  chapter: Chapter,
  nodeId: string | null,
  san: string,
): RepertoireNode | undefined {
  return getChildren(chapter, nodeId).find((child) => child.san === san)
}
