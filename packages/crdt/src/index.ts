// tslint:disable: no-object-mutation no-expression-statement
import { GunGraphData, GunNode, GunNodeState, GunValue } from '@chaingun/types'

const EMPTY = {}

export function addMissingState(graphData: GunGraphData): GunGraphData {
  const updatedGraphData = { ...graphData }
  const now = new Date().getTime()

  for (const soul in graphData) {
    if (!soul) {
      continue
    }

    const node = graphData[soul]
    if (!node) {
      continue
    }
    // @ts-ignore
    const meta = (node._ = node._ || {})
    // @ts-ignore
    meta['#'] = soul
    // @ts-ignore
    const state = (meta['>'] = meta['>'] || {})

    for (const key in node) {
      if (key === '_') {
        continue
      }
      // @ts-ignore
      state[key] = state[key] || now
    }

    // tslint:disable-next-line: no-object-mutation no-expression-statement
    updatedGraphData[soul] = node
  }

  return updatedGraphData
}

const DEFAULT_OPTS = {
  Lexical: JSON.stringify, // what gun.js uses
  futureGrace: 10 * 60 * 1000
}

export function diffGunCRDT(
  updatedGraph: GunGraphData,
  existingGraph: GunGraphData,
  opts: {
    readonly machineState?: number
    readonly futureGrace?: number
    readonly Lexical?: (x: GunValue) => any
  } = DEFAULT_OPTS
): GunGraphData | undefined {
  const {
    machineState = new Date().getTime(),
    futureGrace = DEFAULT_OPTS.futureGrace,
    Lexical = DEFAULT_OPTS.Lexical
  } = opts || EMPTY
  const maxState = machineState + futureGrace // eslint-disable-line

  const allUpdates: GunGraphData = {}

  for (const soul in updatedGraph) {
    if (!soul) {
      continue
    }
    const existing = existingGraph[soul]
    const updated = updatedGraph[soul]
    const existingState: GunNodeState =
      (existing && existing._ && existing._['>']) || EMPTY
    const updatedState: GunNodeState =
      (updated && updated._ && updated._['>']) || EMPTY

    if (!updated) {
      if (!(soul in existingGraph)) {
        // @ts-ignore
        allUpdates[soul] = updated
      }
      continue
    }

    // tslint:disable-next-line: no-let
    let hasUpdates = false

    const updates: GunNode = {
      _: {
        '#': soul,
        '>': {}
      }
    }

    for (const key in updatedState) {
      if (!key) {
        continue
      }

      const existingKeyState = existingState[key]
      const updatedKeyState = updatedState[key]

      if (updatedKeyState > maxState || !updatedKeyState) {
        continue
      }
      if (existingKeyState && existingKeyState >= updatedKeyState) {
        continue
      }
      if (existingKeyState === updatedKeyState) {
        const existingVal = (existing && existing[key]) || undefined
        const updatedVal = updated[key]
        // This is based on Gun's logic
        if (Lexical(updatedVal) <= Lexical(existingVal)) {
          continue
        }
      }
      // @ts-ignore
      updates[key] = updated[key]
      // @ts-ignore
      updates._['>'][key] = updatedKeyState
      // tslint:disable-next-line: no-expression-statement
      hasUpdates = true
    }

    if (hasUpdates) {
      // @ts-ignore
      allUpdates[soul] = updates
    }
  }

  return Object.keys(allUpdates) ? allUpdates : undefined
}

export function mergeGunNodes(
  existing: GunNode | undefined,
  updates: GunNode | undefined,
  mut: 'immutable' | 'mutable' = 'immutable'
): GunNode | undefined {
  if (!existing) {
    return updates
  }
  if (!updates) {
    return existing
  }
  const existingMeta = existing._ || {}
  const existingState = existingMeta['>'] || {}
  const updatedMeta = updates._ || {}
  const updatedState = updatedMeta['>'] || {}

  if (mut === 'mutable') {
    // @ts-ignore
    existingMeta['>'] = existingState
    // @ts-ignore
    existing._ = existingMeta

    for (const key in updatedState) {
      if (!key) {
        continue
      }
      // @ts-ignore
      existing[key] = updates[key]
      // @ts-ignore
      existingState[key] = updatedState[key]
    }

    return existing
  }

  return {
    ...existing,
    ...updates,
    _: {
      '#': existingMeta['#'],
      '>': {
        ...existingMeta['>'],
        ...updates._['>']
      }
    }
  }
}

export function mergeGraph(
  existing: GunGraphData,
  diff: GunGraphData,
  mut: 'immutable' | 'mutable' = 'immutable'
): GunGraphData {
  const result: GunGraphData = mut ? existing : { ...existing }
  for (const soul in diff) {
    if (!soul) {
      continue
    }

    // @ts-ignore
    result[soul] = mergeGunNodes(existing[soul], diff[soul], mut)
  }
  return result
}
