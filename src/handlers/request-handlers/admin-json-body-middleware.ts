import { json, Request, RequestHandler } from 'express'

export type AdminRequest = Request & {
  rawBody?: Buffer
}

// Keep admin JSON bodies bounded so unauthenticated NIP-98 probes cannot force
// arbitrarily large parses. Settings patches are small key/value documents.
const ADMIN_JSON_BODY_LIMIT = '1mb'

/**
 * JSON body parser that keeps the raw bytes for NIP-98 payload hashing.
 */
export const adminJsonBodyMiddleware: RequestHandler = json({
  limit: ADMIN_JSON_BODY_LIMIT,
  verify: (request: AdminRequest, _response, buffer) => {
    // Always copy — do not alias Express's internal buffer.
    request.rawBody = Buffer.from(buffer)
  },
})
