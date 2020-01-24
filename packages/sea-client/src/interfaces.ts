interface GunNodeState {
  [key: string]: number
}

interface GunNode {
  _: {
    '#': string
    '>': GunNodeState
  }
  [key: string]: any
}

interface GunGraphData {
  [key: string]: GunNode | undefined
}

interface GunMsg {
  '#'?: string
  '@'?: string

  get?: {
    '#': string
  }

  put?: {
    [soul: string]: GunNode
  }
}

type GunValue = object | string | number | boolean | null
type ChainGunOptions = any
type GunChainOptions = any
type SendFn = (msg: GunMsg) => void
type GunOnCb = (node: GunValue | undefined, key?: string) => void
type GunPutCb = (res: { ack: number; err?: any }) => void
type GunNodeListenCb = (node: GunNode | undefined) => void

interface PathData {
  souls: string[]
  value: GunValue | undefined
  complete: boolean
}

type ChainGunMiddleware = (
  updates: GunGraphData,
  existingGraph: GunGraphData
) => GunGraphData | undefined | Promise<GunGraphData | undefined>
type ChainGunMiddlewareType = 'read' | 'write'
