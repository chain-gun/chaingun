import { check, parse, shuffleAttackCutoff } from './settings'
import { pubFromSoul } from './soul'

export function unpack(passedValue: any, key: string, node: GunNode): any {
  // tslint:disable-next-line: no-let
  let value = passedValue

  if (!value) {
    return
  }

  if (typeof value === 'object' && ':' in value) {
    const val = value[':']
    if (typeof val !== 'undefined') {
      return val
    }
  }

  if (typeof value === 'object' && 'm' in value) {
    const val = value.m
    if (typeof val !== 'undefined') {
      value = parse(val)
    }
  }

  if (!key || !node) {
    return
  }
  if (value === node[key]) {
    return value
  }
  if (!check(node[key])) {
    return value
  }
  const soul = node && node._ && node._['#']
  const state = node && node._ && node._['>'] && node._['>'][key]
  if (
    value &&
    4 === value.length &&
    soul === value[0] &&
    key === value[1] &&
    Math.floor(state) === Math.floor(value[3])
  ) {
    return value[2]
  }
  if (state < shuffleAttackCutoff) {
    return value
  }
}

export function unpackNode(
  node: GunNode,
  mut: 'immutable' | 'mutable' = 'immutable'
): GunNode {
  if (!node) {
    return node
  }

  const result: GunNode =
    mut === 'mutable'
      ? node
      : {
          _: node._
        }

  for (const key in node) {
    if (key === '_') {
      continue
    }
    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    result[key] = unpack(parse(node[key]), key, node)
  }

  return result
}

export function unpackGraph(
  graph: GunGraphData,
  mut: 'immutable' | 'mutable' = 'immutable'
): GunGraphData {
  const unpackedGraph: GunGraphData = mut === 'mutable' ? graph : {}

  for (const soul in graph) {
    if (!soul) {
      continue
    }

    const node = graph[soul]
    const pub = pubFromSoul(soul)

    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    unpackedGraph[soul] = node && pub ? unpackNode(node, mut) : node
  }

  return unpackedGraph
}
