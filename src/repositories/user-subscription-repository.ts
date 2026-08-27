import { DatabaseClient, Pubkey } from '../@types/base'
import { IUserSubscriptionRepository } from '../@types/repositories'
import { DBUserSubscription, UserSubscription } from '../@types/user-subscription'
import { createLogger } from '../factories/logger-factory'
import { toBuffer } from '../utils/transform'

const logger = createLogger('user-subscription-repository')

function fromDBUserSubscription(row: DBUserSubscription): UserSubscription {
  return {
    pubkey: row.pubkey.toString('hex'),
    planId: row.plan_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    lastInvoiceId: row.last_invoice_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class UserSubscriptionRepository implements IUserSubscriptionRepository {
  public constructor(private readonly dbClient: DatabaseClient) {}

  public async findByPubkey(
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient,
  ): Promise<UserSubscription | undefined> {
    const [row] = await client<DBUserSubscription>('user_subscriptions').where('pubkey', toBuffer(pubkey)).select()

    if (!row) {
      return undefined
    }

    return fromDBUserSubscription(row)
  }

  public async upsert(
    subscription: Omit<UserSubscription, 'createdAt' | 'updatedAt'>,
    client: DatabaseClient = this.dbClient,
  ): Promise<UserSubscription> {
    logger(
      'granting %s plan %s until %s',
      subscription.pubkey,
      subscription.planId,
      subscription.currentPeriodEnd.toISOString(),
    )

    const now = new Date()
    const row: DBUserSubscription = {
      pubkey: toBuffer(subscription.pubkey),
      plan_id: subscription.planId,
      current_period_start: subscription.currentPeriodStart,
      current_period_end: subscription.currentPeriodEnd,
      last_invoice_id: subscription.lastInvoiceId ?? null,
      created_at: now,
      updated_at: now,
    }

    await client<DBUserSubscription>('user_subscriptions')
      .insert(row)
      .onConflict('pubkey')
      .merge(['plan_id', 'current_period_start', 'current_period_end', 'last_invoice_id', 'updated_at'])

    return fromDBUserSubscription(row)
  }
}
