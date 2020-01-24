import { diffGunCRDT, mergeGraph } from '@chaingun/crdt'
import { GunGraphAdapter, GunGraphData, GunNode } from '@chaingun/types'
import { clone, curry } from 'ramda'

const DEFAULT_OPTS = {
  diffFn: diffGunCRDT,
  mergeFn: mergeGraph
}

const getSync = curry(
  (
    // tslint:disable-next-line: variable-name
    _opts: typeof DEFAULT_OPTS,
    graph: GunGraphData,
    soul: string
  ): GunNode | null => clone(graph[soul]) || null
)

const get = curry(
  (
    opts: typeof DEFAULT_OPTS,
    graph: GunGraphData,
    soul: string
  ): Promise<GunNode | null> => Promise.resolve(getSync(opts, graph, soul))
)

const putSync = curry(
  (
    // tslint:disable-next-line: variable-name
    { diffFn, mergeFn }: typeof DEFAULT_OPTS,
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
    opts: typeof DEFAULT_OPTS,
    graph: GunGraphData,
    graphData: GunGraphData
  ): Promise<GunGraphData | null> =>
    Promise.resolve(putSync(opts, graph, graphData))
)

export function createMemoryAdapter(opts = DEFAULT_OPTS): GunGraphAdapter {
  const graph: GunGraphData = {}

  return {
    get: get(opts, graph),
    getSync: getSync(opts, graph),
    put: put(opts, graph),
    putSync: putSync(opts, graph)
  }
}
