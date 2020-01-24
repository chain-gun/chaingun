import { addMissingState, diffGunCRDT, mergeGraph } from '@chaingun/crdt'
import { GunGraphData, GunNode } from '@chaingun/types'
import { ChainGunLink } from '../ChainGunLink'
import { PathData } from '../interfaces'

export function generateMessageId(): string {
  return Math.random()
    .toString(36)
    .slice(2)
}

export function diffSets(
  initial: readonly string[],
  updated: readonly string[]
): readonly [readonly string[], readonly string[]] {
  return [
    updated.filter(key => initial.indexOf(key) === -1),
    initial.filter(key => updated.indexOf(key) === -1)
  ]
}

export function nodeToGraph(node: GunNode): GunGraphData {
  const modified = { ...node }
  // tslint:disable-next-line: no-let
  let nodes: GunGraphData = {}
  const nodeSoul = node && node._ && node._['#']

  for (const key in node) {
    if (key === '_') {
      continue
    }
    const val = node[key]
    if (typeof val !== 'object' || val === null) {
      continue
    }

    if (val.soul) {
      const edge = { '#': val.soul }
      modified[key] = edge

      continue
    }

    // tslint:disable-next-line: no-let
    let soul = val && (val._ && val._['#'])

    if (val instanceof ChainGunLink && val.soul) {
      soul = val.soul
    }

    if (soul) {
      const edge = { '#': soul }
      modified[key] = edge
      const graph = addMissingState(nodeToGraph(val))
      const diff = diffGunCRDT(graph, nodes)
      nodes = diff ? mergeGraph(nodes, diff) : nodes
    }
  }

  const raw = { [nodeSoul]: modified }
  const withMissingState = addMissingState(raw)
  const graphDiff = diffGunCRDT(withMissingState, nodes)
  nodes = graphDiff ? mergeGraph(nodes, graphDiff) : nodes

  return nodes
}

export function flattenGraphData(data: GunGraphData): GunGraphData {
  // tslint:disable-next-line: readonly-array
  const graphs: GunGraphData[] = []
  // tslint:disable-next-line: no-let
  let flatGraph: GunGraphData = {}

  for (const soul in data) {
    if (!soul) {
      continue
    }

    const node = data[soul]
    if (node) {
      graphs.push(nodeToGraph(node))
    }
  }

  for (const graph of graphs) {
    const diff = diffGunCRDT(graph, flatGraph)
    flatGraph = diff ? mergeGraph(flatGraph, diff) : flatGraph
  }

  return flatGraph
}

export function getPathData(
  keys: readonly string[],
  graph: GunGraphData
): PathData {
  const lastKey = keys[keys.length - 1]

  if (keys.length === 1) {
    return {
      complete: lastKey in graph,
      souls: keys,
      value: graph[lastKey]
    }
  }

  const { value: parentValue, souls, complete } = getPathData(
    keys.slice(0, keys.length - 1),
    graph
  )

  if (typeof parentValue !== 'object') {
    return {
      complete: complete || typeof parentValue !== 'undefined',
      souls,
      value: undefined
    }
  }

  const value = (parentValue as GunNode)[lastKey]

  if (!value) {
    return {
      complete: true,
      souls,
      value
    }
  }

  const edgeSoul = value['#']

  if (edgeSoul) {
    return {
      complete: edgeSoul in graph,
      souls: [...souls, edgeSoul],
      value: graph[edgeSoul]
    }
  }

  return {
    complete: true,
    souls,
    value
  }
}
