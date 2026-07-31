export type Color = 'white' | 'black'

export interface RepertoireNode {
  id: string
  parentId: string | null
  childIds: string[]
  ply: number
  color: Color
  san: string
  fen: string
  comment?: string
  nags?: string[]
  /** Raw [%cal]/[%csl] annotation strings (e.g. "Gf1c4", "Re5"); structured rendering comes later. */
  shapes?: { arrows: string[]; squares: string[] }
}

export interface Chapter {
  name: string
  trainingColor: Color
  startingFen: string
  rootChildIds: string[]
  nodes: Record<string, RepertoireNode>
}

export interface Repertoire {
  name: string
  chapters: Chapter[]
}
