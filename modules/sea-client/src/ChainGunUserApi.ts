import { authenticate, createUser, graphSigner } from '@chaingun/sear'
import { ChainGunSeaClient } from './ChainGunSeaClient'

interface UserReference {
  readonly alias: string
  readonly pub: string
}

interface AckErr {
  readonly err: Error
}

interface UserCredentials {
  readonly priv: string
  readonly epriv: any
  readonly alias: string
  readonly pub: string
  readonly epub: string
}

type LoginCallback = (userRef: UserReference | AckErr) => void

const DEFAULT_CREATE_OPTS = {}
const DEFAULT_AUTH_OPTS = {}

export class ChainGunUserApi {
  public readonly is?: UserReference
  private readonly _gun: ChainGunSeaClient
  private readonly _signMiddleware?: (graph: any) => Promise<any>

  constructor(gun: ChainGunSeaClient) {
    this._gun = gun
  }

  /**
   *
   * https://gun.eco/docs/User#user-create
   *
   * @param alias
   * @param password
   * @param cb
   * @param opt
   */
  public async create(
    alias: string,
    password: string,
    cb?: LoginCallback,
    _opt = DEFAULT_CREATE_OPTS
  ): Promise<{
    readonly alias: string
    readonly pub: string
  }> {
    try {
      const user = await createUser(this._gun, alias, password)
      const ref = this.useCredentials(user)
      if (cb) {
        cb(ref)
      }
      return ref
    } catch (err) {
      if (cb) {
        cb({ err })
      }
      throw err
    }
  }

  /**
   *
   * https://gun.eco/docs/User#user-auth
   *
   * @param alias
   * @param password
   * @param cb
   * @param opt
   */
  public async auth(
    alias: string,
    password: string,
    cb?: LoginCallback,
    _opt = DEFAULT_AUTH_OPTS
  ): Promise<{
    readonly alias: string
    readonly pub: string
  }> {
    try {
      const user = await authenticate(this._gun, alias, password)
      const ref = this.useCredentials(user)
      if (cb) {
        cb(ref)
      }
      return ref
    } catch (err) {
      if (cb) {
        cb({ err })
      }
      throw err
    }
  }

  /**
   * https://gun.eco/docs/User#user-leave
   */
  public leave(): ChainGunUserApi {
    if (this._signMiddleware) {
      this._gun.graph.unuse(this._signMiddleware, 'write')
      // @ts-ignore
      // tslint:disable-next-line: no-object-mutation
      this._signMiddleware = undefined
      // @ts-ignore
      // tslint:disable-next-line: no-object-mutation
      this.is = undefined
    }

    return this
  }

  public useCredentials(
    credentials: UserCredentials
  ): {
    readonly alias: string
    readonly pub: string
  } {
    this.leave()
    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    this._signMiddleware = graphSigner({
      priv: credentials.priv,
      pub: credentials.pub
    })
    this._gun.graph.use(this._signMiddleware, 'write')
    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    return (this.is = {
      alias: credentials.alias,
      pub: credentials.pub
    })
  }
}
