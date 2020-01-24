import { GunGraphData, GunNode, GunValue } from '@chaingun/types'

export interface GunChainOptions {
  readonly uuid?: (path: readonly string[]) => Promise<string> | string
}
export type GunOnCb = (node: GunValue | undefined, key?: string) => void
export type GunNodeListenCb = (node: GunNode | undefined) => void

export interface PathData {
  readonly souls: readonly string[]
  readonly value: GunValue | undefined
  readonly complete: boolean
}

export type ChainGunMiddleware = (
  updates: GunGraphData,
  existingGraph: GunGraphData
) => GunGraphData | undefined | Promise<GunGraphData | undefined>
export type ChainGunMiddlewareType = 'read' | 'write'
