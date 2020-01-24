export const PEERS_CONFIG_FILE = process.env.PEERS_CONFIG_FILE || './peers.yaml'

export const PEER_SYNC_INTERVAL = readInt(process.env.PEER_SYNC_INTERVAL, 1000)
export const PEER_BACK_SYNC = readInt(process.env.PEER_BACK_SYNC)
export const PEER_MAX_STALENESS = readInt(process.env.PEER_MAX_STALENESS)
export const PEER_BATCH_INTERVAL = readInt(process.env.PEER_BATCH_INTERVAL)

export const PEER_PRUNE_INTERVAL = readInt(
  process.env.PEER_PRUNE_INTERVAL,
  60 * 60 * 1000
)

export const PEER_CHANGELOG_RETENTION = readInt(
  process.env.PEER_CHANGELOG_RETENTION,
  24 * 60 * 60 * 1000
)

export const SSE_PING_INTERVAL = readInt(
  process.env.SSE_PING_INTERVAL,
  30 * 1000
)

function readInt(val?: string, defValue?: number): number | undefined {
  const parsed = parseInt(val, 10)
  return parsed || parsed === 0 ? parsed : defValue
}
