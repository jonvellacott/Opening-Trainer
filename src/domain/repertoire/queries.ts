import type { Chapter, RepertoireNode } from './types'

/** Pass nodeId=null to get the chapter's first moves. */
export function getChildren(chapter: Chapter, nodeId: string | null): RepertoireNode[] {
  const ids = nodeId === null ? chapter.rootChildIds : chapter.nodes[nodeId].childIds
  return ids.map((id) => chapter.nodes[id])
}
