import {
  FederatedGunGraphAdapter,
  FederationAdapter
} from '@chaingun/federation-adapter'
// tslint:disable-next-line: no-implicit-dependencies
import { createGraphAdapter as createHttpAdapter } from '@chaingun/http-adapter'
import { createServer } from '@chaingun/http-server'
import createAdapter from '@chaingun/node-adapters'
import { pseudoRandomText, verify } from '@chaingun/sear'
import { GunGraphAdapter, GunGraphData, GunMsg, GunNode } from '@chaingun/types'
import express from 'express'
import fs from 'fs'
import yaml from 'js-yaml'
import morgan from 'morgan'
import healthChecker from 'sc-framework-health-check'
import { SCServerSocket } from 'socketcluster-server'
// tslint:disable-next-line: no-submodule-imports
import SCWorker from 'socketcluster/scworker'
import { ChangelogFeed } from './ChangelogFeed'
import {
  PEER_BACK_SYNC,
  PEER_BATCH_INTERVAL,
  PEER_CHANGELOG_RETENTION,
  PEER_MAX_STALENESS,
  PEER_PRUNE_INTERVAL,
  PEER_SYNC_INTERVAL,
  PEERS_CONFIG_FILE,
  SSE_PING_INTERVAL
} from './config'

async function sleep(duration = 1000): Promise<void> {
  return new Promise(ok => setTimeout(ok, duration))
}

function peersFromConfig(): Record<string, GunGraphAdapter> {
  // tslint:disable-next-line: no-let
  let peersConfigTxt = ''

  try {
    peersConfigTxt = fs.readFileSync(PEERS_CONFIG_FILE).toString()
  } catch (e) {
    // tslint:disable-next-line: no-console
    console.warn('Peers config missing', PEERS_CONFIG_FILE, e.stack)
  }

  const peerUrls = yaml.safeLoad(peersConfigTxt) || []
  const peers: Record<string, GunGraphAdapter> = peerUrls.reduce((pm, url) => {
    return {
      ...pm,
      [url]: createHttpAdapter(`${url}/gun`)
    }
  }, {})
  return peers
}

export class GunSocketClusterWorker extends SCWorker {
  public readonly adapter: FederatedGunGraphAdapter
  public readonly internalAdapter: GunGraphAdapter
  public readonly changelogFeed: ChangelogFeed

  constructor(...args: any) {
    super(...args)
    this.internalAdapter = this.setupAdapter()
    this.adapter = this.wrapAdapter(this.internalAdapter)
    this.changelogFeed = new ChangelogFeed(this.adapter, this.exchange)
  }

  public run(): void {
    this.httpServer.on('request', this.setupExpress())
    this.setupMiddleware()

    if (this.isLeader) {
      this.syncWithPeers()

      this.prune()
      setInterval(this.prune.bind(this), PEER_PRUNE_INTERVAL)
    }
  }

  public isAdmin(socket: SCServerSocket): boolean {
    return (
      socket.authToken && socket.authToken.pub === process.env.GUN_OWNER_PUB
    )
  }

  /**
   * Persist put data and publish any resulting diff
   *
   * @param msg
   */
  public async processPut(msg: GunMsg): Promise<GunMsg> {
    const msgId = pseudoRandomText()

    try {
      if (msg.put) {
        await this.adapter.put(msg.put)
      }

      return {
        '#': msgId,
        '@': msg['#'],
        err: null,
        ok: true
      }
    } catch (e) {
      return {
        '#': msgId,
        '@': msg['#'],
        err: 'Error saving',
        ok: false
      }
    }
  }

  public readNode(soul: string): Promise<GunNode | null> {
    return this.adapter.get(soul)
  }

  protected async prune(): Promise<void> {
    const before = new Date().getTime() - PEER_CHANGELOG_RETENTION
    return (
      this.internalAdapter.pruneChangelog &&
      this.internalAdapter.pruneChangelog(before)
    )
  }

  protected getPeers(): Record<string, GunGraphAdapter> {
    return peersFromConfig()
  }

  protected async syncWithPeers(): Promise<void> {
    this.adapter.connectToPeers()

    while (true) {
      try {
        await this.adapter.syncWithPeers()
      } catch (e) {
        // tslint:disable-next-line: no-console
        console.error('Sync error', e.stack || e)
      }

      await sleep(PEER_SYNC_INTERVAL)
    }
  }

  protected wrapAdapter(adapter: GunGraphAdapter): FederatedGunGraphAdapter {
    const withPublish = {
      ...adapter,
      put: async (graph: GunGraphData) => {
        const diff = await adapter.put(graph)

        if (diff) {
          this.publishDiff({
            '#': pseudoRandomText(),
            put: diff
          })
        }

        return diff
      },
      putSync: undefined
    }

    const withValidation = {
      ...withPublish,
      put: (graph: GunGraphData) => {
        return this.validatePut(graph).then(isValid => {
          if (isValid) {
            return withPublish.put(graph)
          }

          throw new Error('Invalid graph data')
        })
      }
    }

    return FederationAdapter.create(
      withPublish,
      this.getPeers(),
      withValidation,
      {
        backSync: PEER_BACK_SYNC,
        batchInterval: PEER_BATCH_INTERVAL,
        maxStaleness: PEER_MAX_STALENESS,
        putToPeers: true
      }
    )
  }

  protected setupAdapter(): GunGraphAdapter {
    return createAdapter()
  }

  // tslint:disable-next-line: variable-name
  protected async validatePut(_graph: GunGraphData): Promise<boolean> {
    return true
  }

  protected setupExpress(): express.Application {
    const environment = this.options.environment
    const app = createServer(this.adapter)

    if (environment === 'dev') {
      // Log every HTTP request.
      // See https://github.com/expressjs/morgan for other available formats.
      app.use(morgan('dev'))
    }

    app.get('/gun/changelog', (req, res) => {
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream'
      })
      res.write('\n')

      // @ts-ignore
      // tslint:disable-next-line: no-unused-expression
      res.flush && res.flush()

      const pingInterval = setInterval(() => {
        res.write('event: ping\n\n')
        // @ts-ignore
        // tslint:disable-next-line: no-unused-expression
        res.flush && res.flush()
      }, SSE_PING_INTERVAL)

      const off = this.changelogFeed.feed((key: string, diff: GunGraphData) => {
        res.write(`id: ${key}\n`)
        res.write(`data: ${JSON.stringify(diff)}\n\n`)
        // @ts-ignore
        // tslint:disable-next-line: no-unused-expression
        res.flush && res.flush()
      }, req.headers['Last-Event-ID'] || req.query.lastId)

      req.on('close', () => {
        off()
        clearInterval(pingInterval)
      })
    })

    // Listen for HTTP GET "/health-check".
    healthChecker.attach(this, app)
    return app
  }

  protected setupMiddleware(): void {
    this.scServer.addMiddleware(
      this.scServer.MIDDLEWARE_SUBSCRIBE,
      this.subscribeMiddleware.bind(this)
    )

    this.scServer.addMiddleware(
      this.scServer.MIDDLEWARE_PUBLISH_IN,
      this.publishInMiddleware.bind(this)
    )

    this.scServer.on('connection', socket => {
      socket.on('login', (req, respond) =>
        this.authenticateLogin(socket, req, respond)
      )
    })
  }

  /**
   * Authenticate a connection for extra privileges
   *
   * @param req
   */
  protected async authenticateLogin(
    socket: SCServerSocket,
    req: {
      readonly pub: string
      readonly proof: {
        readonly m: string
        readonly s: string
      }
    },
    respond: {
      (arg0: null, arg1: string): void
      (arg0?: Error): void
      (arg0: null, arg1: string): void
    }
  ): Promise<void> {
    if (!req.pub || !req.proof) {
      respond(null, 'Missing login info')
      return
    }

    try {
      const [socketId, timestampStr] = req.proof.m.split('/')
      const timestamp = parseInt(timestampStr, 10)
      const now = new Date().getTime()
      const drift = Math.abs(now - timestamp)
      const maxDrift =
        (process.env.SC_AUTH_MAX_DRIFT &&
          parseInt(process.env.SC_AUTH_MAX_DRIFT, 10)) ||
        1000 * 60 * 5

      if (drift > maxDrift) {
        respond(new Error('Exceeded max clock drift'))
        return
      }

      if (!socketId || socketId !== socket.id) {
        respond(new Error("Socket ID doesn't match"))
        return
      }

      const isVerified = await verify(req.proof, req.pub)

      if (isVerified) {
        socket.setAuthToken({
          pub: req.pub,
          timestamp
        })
        respond()
      } else {
        respond(null, 'Invalid login')
      }
    } catch (err) {
      respond(null, 'Invalid login')
    }
  }

  protected subscribeMiddleware(req: any, next: (arg0?: Error) => void): void {
    if (req.channel === 'gun/put' || req.channel === 'gun/get') {
      if (!this.isAdmin(req.socket)) {
        next(new Error(`You aren't allowed to subscribe to ${req.channel}`))
        return
      }
    }

    const soul = req.channel.replace(/^gun\/nodes\//, '')

    if (!soul || soul === req.channel) {
      next()
      return
    }

    next()

    if (soul === 'changelog') {
      return
    }

    const msgId = Math.random()
      .toString(36)
      .slice(2)

    this.readNode(soul)
      .then(node => ({
        channel: req.channel,
        data: {
          '#': msgId,
          put: node
            ? {
                [soul]: node
              }
            : null
        }
      }))
      .catch(e => {
        // tslint:disable-next-line: no-console
        console.warn(e.stack || e)
        return {
          channel: req.channel,
          data: {
            '#': msgId,
            '@': req['#'],
            err: 'Error fetching node'
          }
        }
      })
      .then(msg => {
        setTimeout(() => {
          // Not sure why this delay is necessary and it really shouldn't be
          // Only thing I can figure is if we don't wait we emit before subscribed
          req.socket.emit('#publish', msg)
        }, 25)
      })
  }

  protected publishInMiddleware(
    req: any,
    next: (arg0?: Error | boolean) => void
  ): void {
    const msg = req.data

    if (req.channel !== 'gun/put') {
      if (this.isAdmin(req.socket)) {
        next()
      } else {
        next(new Error("You aren't allowed to write to this channel"))
      }
      return
    }

    next()

    if (req.channel !== 'gun/put' || !msg || !msg.put) {
      return
    }

    this.processPut(msg).then(data => {
      req.socket.emit('#publish', {
        channel: `gun/@${msg['#']}`,
        data
      })
    })
  }

  /**
   * Send put data to node subscribers as a diff
   *
   * @param msg
   */
  protected publishDiff(msg: GunMsg): void {
    const msgId = msg['#']
    const diff = msg.put

    if (!diff) {
      return
    }

    const exchange = this.scServer.exchange

    for (const soul in diff) {
      if (!soul) {
        continue
      }

      const nodeDiff = diff[soul]

      if (!nodeDiff) {
        continue
      }

      exchange.publish(`gun/nodes/${soul}`, {
        '#': `${msgId}/${soul}`,
        put: {
          [soul]: nodeDiff
        }
      })
    }
  }
}
