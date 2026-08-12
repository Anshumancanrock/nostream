import { NextFunction, Response } from 'express'

import { IAdminAuthProvider } from '../../@types/admin'
import { createAdminAuthProvider } from '../../factories/admin-auth-provider-factory'
import { createLogger } from '../../factories/logger-factory'
import { createSettings } from '../../factories/settings-factory'
import { getAbsoluteHttpRequestUrl } from '../../utils/http'
import { DEFAULT_NIP98_MAX_AUTHORIZATION_HEADER_LENGTH, verifyNip98Auth } from '../../utils/nip98'
import { AdminRequest } from './admin-json-body-middleware'

const logger = createLogger('admin-auth-middleware')

// Reuse one provider instance — factory construction is unnecessary per request.
const adminAuthProvider: IAdminAuthProvider = createAdminAuthProvider()

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const isNostrAuthorizationHeader = (authorizationHeader: string | undefined): boolean => {
  if (typeof authorizationHeader !== 'string') {
    return false
  }

  return /^Nostr\s+/i.test(authorizationHeader.trim())
}

const isAllowedNip98Pubkey = (pubkey: string, allowedPubkeys: string[] | undefined): boolean => {
  if (!Array.isArray(allowedPubkeys) || allowedPubkeys.length === 0) {
    return false
  }

  const normalized = pubkey.toLowerCase()
  return allowedPubkeys.some((allowed) => typeof allowed === 'string' && allowed.toLowerCase() === normalized)
}

const resolveBodyForNip98 = (request: AdminRequest): Buffer | undefined | 'missing-raw-body' => {
  if (request.rawBody !== undefined) {
    return request.rawBody
  }

  if (!METHODS_WITH_BODY.has(request.method.toUpperCase())) {
    return undefined
  }

  // Mutating requests must have captured bytes when a body may be present.
  // content-length>0 OR chunked TE without a captured rawBody is unsafe to treat as empty
  // (payload binding would be skipped while a parser might still have consumed a body).
  const contentLength = Number(request.headers['content-length'] ?? '0')
  const transferEncodingHeader = request.headers['transfer-encoding']
  const transferEncoding = Array.isArray(transferEncodingHeader)
    ? transferEncodingHeader.join(',')
    : (transferEncodingHeader ?? '')
  const hasChunkedBody = transferEncoding.toLowerCase().includes('chunked')

  if ((Number.isFinite(contentLength) && contentLength > 0) || hasChunkedBody) {
    return 'missing-raw-body'
  }

  return Buffer.alloc(0)
}

const sendUnauthorized = (response: Response): void => {
  response.status(401).setHeader('content-type', 'application/json').send({ error: 'Unauthorized' })
}

/**
 * Reject unauthenticated requests before the JSON body parser runs.
 * Session-authenticated callers pass through. NIP-98 callers are cryptographically
 * verified (except payload binding, which needs raw body bytes) and allowlisted here
 * so junk `Authorization: Nostr` headers never reach JSON parse.
 */
export const adminAuthGateMiddleware = async (request: AdminRequest, response: Response, next: NextFunction) => {
  try {
    if (adminAuthProvider.isRequestAuthenticated(request)) {
      next()
      return
    }

    const settings = createSettings()
    const nip98Settings = settings.admin?.nip98
    const authorizationHeader = request.headers.authorization

    if (nip98Settings?.enabled !== true || !isNostrAuthorizationHeader(authorizationHeader)) {
      sendUnauthorized(response)
      return
    }

    if (authorizationHeader.length > DEFAULT_NIP98_MAX_AUTHORIZATION_HEADER_LENGTH) {
      logger('rejecting NIP-98 auth gate: authorization header too large')
      sendUnauthorized(response)
      return
    }

    const absoluteUrl = getAbsoluteHttpRequestUrl(request, settings)
    if (!absoluteUrl) {
      logger('rejecting NIP-98 auth gate: unable to build absolute request URL')
      sendUnauthorized(response)
      return
    }

    // Body omitted on purpose — payload binding happens after adminJsonBodyMiddleware.
    const result = await verifyNip98Auth({
      authorizationHeader,
      url: absoluteUrl,
      method: request.method.toUpperCase(),
      maxSkewSeconds: nip98Settings.maxSkewSeconds,
    })

    if (result.ok === false) {
      logger('rejecting NIP-98 auth gate: %s', result.reason)
      sendUnauthorized(response)
      return
    }

    if (!isAllowedNip98Pubkey(result.pubkey, nip98Settings.allowedPubkeys)) {
      logger('rejecting NIP-98 auth gate: pubkey %s is not allowlisted', result.pubkey)
      sendUnauthorized(response)
      return
    }

    next()
  } catch (error) {
    logger('admin auth gate error: %o', error)
    response.status(500).setHeader('content-type', 'application/json').send({ error: 'Internal Server Error' })
  }
}

export const adminAuthMiddleware = async (request: AdminRequest, response: Response, next: NextFunction) => {
  try {
    // Always re-validate the session cryptographically. Do not trust a request flag
    // (prototype-pollution resistant).
    if (adminAuthProvider.isRequestAuthenticated(request)) {
      next()
      return
    }

    const settings = createSettings()
    const nip98Settings = settings.admin?.nip98
    const authorizationHeader = request.headers.authorization

    if (!nip98Settings?.enabled || !isNostrAuthorizationHeader(authorizationHeader)) {
      sendUnauthorized(response)
      return
    }

    const absoluteUrl = getAbsoluteHttpRequestUrl(request, settings)
    if (!absoluteUrl) {
      logger('rejecting NIP-98 auth: unable to build absolute request URL')
      sendUnauthorized(response)
      return
    }

    const body = resolveBodyForNip98(request)
    if (body === 'missing-raw-body') {
      logger('rejecting NIP-98 auth: request body present but rawBody was not captured')
      sendUnauthorized(response)
      return
    }

    const result = await verifyNip98Auth({
      authorizationHeader,
      url: absoluteUrl,
      method: request.method.toUpperCase(),
      body,
      maxSkewSeconds: nip98Settings.maxSkewSeconds,
      payloadPolicy: 'require-when-body',
    })

    if (result.ok === false) {
      logger('rejecting NIP-98 auth: %s', result.reason)
      sendUnauthorized(response)
      return
    }

    if (!isAllowedNip98Pubkey(result.pubkey, nip98Settings.allowedPubkeys)) {
      logger('rejecting NIP-98 auth: pubkey %s is not allowlisted', result.pubkey)
      sendUnauthorized(response)
      return
    }

    next()
  } catch (error) {
    logger('admin auth middleware error: %o', error)
    response.status(500).setHeader('content-type', 'application/json').send({ error: 'Internal Server Error' })
  }
}
