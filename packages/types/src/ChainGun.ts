import { GunGraphData, GunMsg } from '.'

export type GunMsgCb = (msg: GunMsg) => void

/**
 * How puts are communicated to ChainGun connectors
 */
export interface ChainGunPut {
  readonly graph: GunGraphData
  readonly msgId?: string
  readonly replyTo?: string
  readonly cb?: GunMsgCb
}

/**
 * How gets are communicated to ChainGun connectors
 */
export interface ChainGunGet {
  readonly soul: string
  readonly msgId?: string
  readonly key?: string
  readonly cb?: GunMsgCb
}
