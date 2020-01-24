import { GunGraphData, GunNode } from './Gun'

export type ChangeSetEntry = readonly [string, GunGraphData]

export interface GunGetOpts {
  readonly '.'?: string
  readonly '>'?: string
  readonly '<'?: string
  readonly '%'?: string
}

export interface GunGraphAdapter {
  readonly close?: () => void
  readonly get: (soul: string, opts?: GunGetOpts) => Promise<GunNode | null>
  readonly getJsonString?: (soul: string, opts?: GunGetOpts) => Promise<string>
  readonly getJsonStringSync?: (soul: string, opts?: GunGetOpts) => string
  readonly getSync?: (soul: string, opts?: GunGetOpts) => GunNode | null
  readonly put: (graphData: GunGraphData) => Promise<GunGraphData | null>
  readonly putSync?: (graphData: GunGraphData) => GunGraphData | null

  readonly pruneChangelog?: (before: number) => Promise<void>

  readonly getChangesetFeed?: (
    from: string
  ) => () => Promise<ChangeSetEntry | null>

  readonly onChange?: (
    handler: (change: ChangeSetEntry) => void,
    from?: string
  ) => () => void
}
