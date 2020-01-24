import { ChainGunGet, ChainGunPut, GunGraphAdapter } from '@chaingun/types'
import { generateMessageId } from '../Graph/GunGraphUtils'
import { GunGraphWireConnector } from './GunGraphWireConnector'

// tslint:disable-next-line: no-empty
const NOOP = () => undefined

export class GunGraphConnectorFromAdapter extends GunGraphWireConnector {
  protected readonly adapter: GunGraphAdapter

  constructor(adapter: GunGraphAdapter, name = 'GunGraphConnectorFromAdapter') {
    super(name)
    this.adapter = adapter
  }

  public get({ soul, cb, msgId = '' }: ChainGunGet): () => void {
    this.adapter
      .get(soul)
      .then(node => ({
        '#': generateMessageId(),
        '@': msgId,
        put: node
          ? {
              [soul]: node
            }
          : undefined
      }))
      .catch(error => {
        // tslint:disable-next-line: no-console
        console.warn(error.stack || error)

        return {
          '#': generateMessageId(),
          '@': msgId,
          err: 'Error fetching node'
        }
      })
      .then(msg => {
        this.ingest([msg])
        if (cb) {
          cb(msg)
        }
      })

    return NOOP
  }

  public put({ graph, msgId = '', cb }: ChainGunPut): () => void {
    this.adapter
      .put(graph)
      .then(() => {
        return {
          '#': generateMessageId(),
          '@': msgId,
          err: null,
          ok: true
        }
      })
      .catch(error => {
        // tslint:disable-next-line: no-console
        console.warn(error.stack || error)

        return {
          '#': generateMessageId(),
          '@': msgId,
          err: 'Error saving put',
          ok: false
        }
      })
      .then(msg => {
        this.ingest([msg])
        if (cb) {
          cb(msg)
        }
      })

    return NOOP
  }
}
