/**
 * Timestamp of last change for each attribute
 */
export interface GunNodeState {
  readonly [key: string]: number
}

/**
 * Soul and State of a Gun Node
 */
export interface GunNodeMeta {
  readonly '#': string
  readonly '>': GunNodeState
}

/**
 * A node (or partial node data) in a Gun Graph
 */
export interface GunNode {
  readonly _: GunNodeMeta
  // tslint:disable-next-line: no-mixed-interface
  readonly [key: string]: any
}

/**
 * Gun Graph Data consists of one or more full or partial nodes
 */
export interface GunGraphData {
  readonly [key: string]: GunNode | undefined
}

/**
 * A standard Gun Protocol Message
 */
export interface GunMsg {
  readonly '#'?: string
  readonly '@'?: string

  readonly get?: {
    readonly '#': string
  }

  readonly put?: GunGraphData

  readonly ack?: number | boolean
  readonly err?: any
  readonly ok?: boolean | number
}

/**
 * Valid values in GunDB
 */
export type GunValue = object | string | number | boolean | null
