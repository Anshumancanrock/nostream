import { Pubkey } from './base'

export interface UserSubscription {
  pubkey: Pubkey
  planId: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  lastInvoiceId?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DBUserSubscription {
  pubkey: Buffer
  plan_id: string
  current_period_start: Date
  current_period_end: Date
  last_invoice_id: string | null
  created_at: Date
  updated_at: Date
}
