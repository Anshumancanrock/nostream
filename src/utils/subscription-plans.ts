import { SubscriptionPlan } from '../@types/settings'
import { UserSubscription } from '../@types/user-subscription'

const MILLISECONDS_PER_DAY = 86400000

/** Ten years. Guards against a mistyped period producing an unusable date. */
export const MAX_PLAN_PERIOD_DAYS = 3650

export interface BillingPeriod {
  start: Date
  end: Date
}

/**
 * Plan amounts come from YAML, so they arrive as numbers, strings or bigints.
 * Anything that is not a whole, positive amount is treated as unconfigured
 * rather than throwing during payment confirmation.
 */
export const toPlanAmountMsat = (value: unknown): bigint | undefined => {
  if (typeof value === 'bigint') {
    return value > 0n ? value : undefined
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return undefined
    }

    return BigInt(value)
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = BigInt(value.trim())

    return parsed > 0n ? parsed : undefined
  }

  return undefined
}

export const isUsablePlan = (plan: SubscriptionPlan | undefined): boolean => {
  if (!plan || plan.enabled !== true) {
    return false
  }

  if (typeof plan.id !== 'string' || plan.id.trim().length === 0) {
    return false
  }

  if (!Number.isSafeInteger(plan.periodDays) || plan.periodDays <= 0 || plan.periodDays > MAX_PLAN_PERIOD_DAYS) {
    return false
  }

  return typeof toPlanAmountMsat(plan.amount) !== 'undefined'
}

/**
 * The most expensive enabled plan the payment covers.
 *
 * Overpaying buys the best plan it reaches rather than the exact match, so a
 * payment that lands between two tiers is never rejected outright. Ties resolve
 * to the plan declared first.
 */
export const resolvePlanForAmount = (
  plans: SubscriptionPlan[] | undefined,
  amountPaidMsat: bigint,
): SubscriptionPlan | undefined => {
  if (!Array.isArray(plans) || plans.length === 0 || amountPaidMsat <= 0n) {
    return undefined
  }

  let best: SubscriptionPlan | undefined
  let bestAmount = 0n

  for (const plan of plans) {
    if (!isUsablePlan(plan)) {
      continue
    }

    const amount = toPlanAmountMsat(plan.amount) as bigint
    if (amount > amountPaidMsat || amount <= bestAmount) {
      continue
    }

    best = plan
    bestAmount = amount
  }

  return best
}

/**
 * Timestamps normally arrive from the driver as Dates, but a driver or a
 * hand-written fixture can hand back a string or epoch number. Normalise
 * rather than silently treating a readable period end as absent, which would
 * discard paid time on renewal.
 */
const toValidDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)

    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  return undefined
}

/**
 * Where the period a payment just bought should begin.
 *
 * Renewing the same plan before it lapses stacks onto the remaining time so no
 * paid days are lost. Lapsed subscriptions, and changes to a different plan,
 * start a fresh period from now.
 */
export const resolveNextPeriod = (
  plan: SubscriptionPlan,
  existing: UserSubscription | undefined,
  now: Date,
): BillingPeriod => {
  const existingEnd = toValidDate(existing?.currentPeriodEnd)
  const isRenewalOfSamePlan =
    typeof existingEnd !== 'undefined' && existing?.planId === plan.id && existingEnd.getTime() > now.getTime()

  const start = isRenewalOfSamePlan ? (existingEnd as Date) : now
  const end = new Date(start.getTime() + plan.periodDays * MILLISECONDS_PER_DAY)

  return { start, end }
}
