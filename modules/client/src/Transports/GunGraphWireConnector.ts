import { ChainGunGet, ChainGunPut, GunMsg, GunMsgCb } from '@chaingun/types'
import { generateMessageId } from '../Graph/GunGraphUtils'
import { GunGraphConnector } from './GunGraphConnector'

export abstract class GunGraphWireConnector extends GunGraphConnector {
  private readonly _callbacks: {
    readonly [msgId: string]: GunMsgCb
  }

  constructor(name = 'GunWireProtocol') {
    super(name)
    this._callbacks = {}

    this._onProcessedInput = this._onProcessedInput.bind(this)
    this.inputQueue.completed.on(this._onProcessedInput)
  }

  public off(msgId: string): GunGraphWireConnector {
    super.off(msgId)
    // @ts-ignore
    // tslint:disable-next-line: no-delete
    delete this._callbacks[msgId]
    return this
  }

  /**
   * Send graph data for one or more nodes
   *
   * @returns A function to be called to clean up callback listeners
   */
  public put({ graph, msgId = '', replyTo = '', cb }: ChainGunPut): () => void {
    if (!graph) {
      // tslint:disable-next-line: no-empty
      return () => {}
    }
    const msg: GunMsg = {
      put: graph
    }
    if (msgId) {
      // @ts-ignore
      msg['#'] = msgId
    }
    if (replyTo) {
      // @ts-ignore
      msg['@'] = replyTo
    }

    return this.req(msg, cb)
  }

  /**
   * Request data for a given soul
   *
   * @returns A function to be called to clean up callback listeners
   */
  public get({ soul, cb, msgId = '' }: ChainGunGet): () => void {
    const get = { '#': soul }
    const msg: GunMsg = { get }
    if (msgId) {
      // @ts-ignore
      msg['#'] = msgId
    }

    return this.req(msg, cb)
  }

  /**
   * Send a message that expects responses via @
   *
   * @param msg
   * @param cb
   */
  public req(msg: GunMsg, cb?: GunMsgCb): () => void {
    // @ts-ignore
    const reqId = (msg['#'] = msg['#'] || generateMessageId())
    if (cb) {
      // @ts-ignore
      this._callbacks[reqId] = cb
    }
    this.send([msg])
    return () => {
      this.off(reqId)
    }
  }

  private _onProcessedInput(msg?: GunMsg): void {
    if (!msg) {
      return
    }
    const id = msg['#']
    const replyTo = msg['@']

    if (msg.put) {
      this.events.graphData.trigger(msg.put, id, replyTo)
    }

    if (replyTo) {
      const cb = this._callbacks[replyTo]
      if (cb) {
        cb(msg)
      }
    }

    this.events.receiveMessage.trigger(msg)
  }
}
