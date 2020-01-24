interface GunNodeState {
  readonly [key: string]: number
}

interface GunNodeMeta {
  readonly '#': string
  readonly '>': GunNodeState
}

interface GunNode {
  readonly _: GunNodeMeta
  // tslint:disable-next-line: no-mixed-interface
  readonly [key: string]: GunValue
}

interface GunGraphData {
  readonly [key: string]: GunNode | undefined
}

interface GunMsg {
  readonly '#'?: string
  readonly '##'?: string | number

  readonly get?: {
    readonly '#': string
  }

  readonly put?: {
    readonly [soul: string]: GunNode
  }
}

type GunValue = object | string | number | boolean | null
