import { diffGunCRDT, mergeGraph } from '@chaingun/crdt'
import { GunGraphAdapter, GunGraphData, GunNode } from '@chaingun/types'
import { clone, curry } from 'ramda'

const DEFAULT_OPTS = {
  diffFn: diffGunCRDT,
  mergeFn: mergeGraph
}

interface MemoryAdapterOpts {
  readonly diffFn?: typeof diffGunCRDT
  readonly mergeFn?: typeof mergeGraph
  readonly direct?: boolean
}

const getSync = curry(
  (
    // tslint:disable-next-line: variable-name
    opts: MemoryAdapterOpts,
    graph: GunGraphData,
    soul: string
  ): GunNode | null => (opts.direct ? graph[soul] : clone(graph[soul])) || null
)

const get = curry(
  (
    opts: MemoryAdapterOpts,
    graph: GunGraphData,
    soul: string
  ): Promise<GunNode | null> => Promise.resolve(getSync(opts, graph, soul))
)

const putSync = curry(
  (
    // tslint:disable-next-line: variable-name
    {
      diffFn = DEFAULT_OPTS.diffFn,
      mergeFn = DEFAULT_OPTS.mergeFn
    }: MemoryAdapterOpts,
    graph: GunGraphData,
    graphData: GunGraphData
  ) => {
    const diff = diffFn(graphData, graph)

    if (diff) {
      // tslint:disable-next-line: no-expression-statement
      mergeFn(graph, diff, 'mutable')
    }

    return diff || null
  }
)

const put = curry(
  (
    opts: MemoryAdapterOpts,
    graph: GunGraphData,
    graphData: GunGraphData
  ): Promise<GunGraphData | null> =>
    Promise.resolve(putSync(opts, graph, graphData))
)

export function createMemoryAdapter(
  opts: MemoryAdapterOpts = DEFAULT_OPTS
): GunGraphAdapter {
  const graph: GunGraphData = {}

  return {
    get: get(opts, graph),
    getSync: getSync(opts, graph),
    put: put(opts, graph),
    putSync: putSync(opts, graph)
  }
}
