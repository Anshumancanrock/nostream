import { ICacheAdapter } from '../@types/adapters'
import { RedisAdapter } from '../adapters/redis-adapter'
import { getCacheClient } from '../cache/client'
import { createLogger } from '../factories/logger-factory'

const logger = createLogger('nip98-replay')

let cacheAdapter: ICacheAdapter | undefined

const getCache = (): ICacheAdapter => {
  if (!cacheAdapter) {
    cacheAdapter = new RedisAdapter(getCacheClient())
  }

  return cacheAdapter
}

export const nip98AuthReplayCacheKey = (eventId: string): string => `nip98:auth:${eventId}`

export const claimNip98AuthEventId = async (
  eventId: string,
  ttlSeconds: number,
  cache: ICacheAdapter = getCache(),
): Promise<'claimed' | 'replay' | 'unavailable'> => {
  const expirySeconds = Number.isSafeInteger(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 1

  try {
    const created = await cache.setKeyIfNotExists(nip98AuthReplayCacheKey(eventId), '1', expirySeconds)
    return created ? 'claimed' : 'replay'
  } catch (error) {
    logger('unable to claim NIP-98 auth event %s: %o', eventId, error)
    return 'unavailable'
  }
}

export const resetNip98ReplayCacheAdapterForTests = (): void => {
  cacheAdapter = undefined
}
