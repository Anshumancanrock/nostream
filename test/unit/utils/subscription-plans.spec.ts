import { expect } from 'chai'

import { SubscriptionPlan } from '../../../src/@types/settings'
import { UserSubscription } from '../../../src/@types/user-subscription'
import {
  isUsablePlan,
  MAX_PLAN_PERIOD_DAYS,
  resolveNextPeriod,
  resolvePlanForAmount,
  toPlanAmountMsat,
} from '../../../src/utils/subscription-plans'

const makePlan = (overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan =>
  ({
    id: 'premium',
    enabled: true,
    amount: 5000000n,
    periodDays: 30,
    ...overrides,
  }) as SubscriptionPlan

const makeSubscription = (overrides: Partial<UserSubscription> = {}): UserSubscription => ({
  pubkey: 'ab'.repeat(32),
  planId: 'premium',
  currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
  lastInvoiceId: 'invoice-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
})

describe('subscription plans', () => {
  describe('toPlanAmountMsat', () => {
    it('accepts a positive bigint', () => {
      expect(toPlanAmountMsat(5000000n)).to.equal(5000000n)
    })

    it('accepts a positive integer, as YAML parses it', () => {
      expect(toPlanAmountMsat(5000000)).to.equal(5000000n)
    })

    it('accepts a numeric string', () => {
      expect(toPlanAmountMsat(' 5000000 ')).to.equal(5000000n)
    })

    it('rejects zero and negative amounts', () => {
      expect(toPlanAmountMsat(0n)).to.be.undefined
      expect(toPlanAmountMsat(0)).to.be.undefined
      expect(toPlanAmountMsat(-1)).to.be.undefined
      expect(toPlanAmountMsat('0')).to.be.undefined
    })

    it('rejects fractional amounts rather than truncating them', () => {
      expect(toPlanAmountMsat(1.5)).to.be.undefined
    })

    it('rejects values that are not amounts', () => {
      expect(toPlanAmountMsat('abc')).to.be.undefined
      expect(toPlanAmountMsat(undefined)).to.be.undefined
      expect(toPlanAmountMsat(null)).to.be.undefined
      expect(toPlanAmountMsat({})).to.be.undefined
      expect(toPlanAmountMsat(Number.NaN)).to.be.undefined
    })
  })

  describe('isUsablePlan', () => {
    it('accepts a well-formed enabled plan', () => {
      expect(isUsablePlan(makePlan())).to.equal(true)
    })

    it('rejects a disabled plan', () => {
      expect(isUsablePlan(makePlan({ enabled: false }))).to.equal(false)
    })

    it('rejects a plan with a blank id', () => {
      expect(isUsablePlan(makePlan({ id: '   ' }))).to.equal(false)
    })

    it('rejects non-positive or fractional periods', () => {
      expect(isUsablePlan(makePlan({ periodDays: 0 }))).to.equal(false)
      expect(isUsablePlan(makePlan({ periodDays: -30 }))).to.equal(false)
      expect(isUsablePlan(makePlan({ periodDays: 1.5 }))).to.equal(false)
    })

    it('rejects a period beyond the sanity cap', () => {
      expect(isUsablePlan(makePlan({ periodDays: MAX_PLAN_PERIOD_DAYS }))).to.equal(true)
      expect(isUsablePlan(makePlan({ periodDays: MAX_PLAN_PERIOD_DAYS + 1 }))).to.equal(false)
    })

    it('rejects an unusable amount', () => {
      expect(isUsablePlan(makePlan({ amount: 0n }))).to.equal(false)
    })

    it('rejects an undefined plan', () => {
      expect(isUsablePlan(undefined)).to.equal(false)
    })
  })

  describe('resolvePlanForAmount', () => {
    const free = makePlan({ id: 'free', amount: 1000n })
    const premium = makePlan({ id: 'premium', amount: 5000n })
    const vip = makePlan({ id: 'vip', amount: 50000n })

    it('returns undefined when no plans are configured', () => {
      expect(resolvePlanForAmount(undefined, 10000n)).to.be.undefined
      expect(resolvePlanForAmount([], 10000n)).to.be.undefined
    })

    it('returns undefined for a non-positive payment', () => {
      expect(resolvePlanForAmount([premium], 0n)).to.be.undefined
      expect(resolvePlanForAmount([premium], -1n)).to.be.undefined
    })

    it('matches a plan paid for exactly', () => {
      expect(resolvePlanForAmount([free, premium, vip], 5000n)?.id).to.equal('premium')
    })

    it('picks the most expensive plan the payment covers', () => {
      expect(resolvePlanForAmount([free, premium, vip], 49999n)?.id).to.equal('premium')
      expect(resolvePlanForAmount([free, premium, vip], 50000n)?.id).to.equal('vip')
    })

    it('is independent of the order plans are declared in', () => {
      expect(resolvePlanForAmount([vip, free, premium], 6000n)?.id).to.equal('premium')
    })

    it('returns undefined when the payment covers nothing', () => {
      expect(resolvePlanForAmount([free, premium, vip], 999n)).to.be.undefined
    })

    it('ignores disabled plans', () => {
      const disabledVip = makePlan({ id: 'vip', amount: 50000n, enabled: false })
      expect(resolvePlanForAmount([premium, disabledVip], 60000n)?.id).to.equal('premium')
    })

    it('ignores malformed plans instead of throwing', () => {
      const malformed = {
        id: 'broken',
        enabled: true,
        amount: 'not-a-number',
        periodDays: 30,
      } as unknown as SubscriptionPlan
      expect(resolvePlanForAmount([malformed, premium], 60000n)?.id).to.equal('premium')
    })

    it('resolves a tie to the plan declared first', () => {
      const first = makePlan({ id: 'first', amount: 5000n })
      const second = makePlan({ id: 'second', amount: 5000n })
      expect(resolvePlanForAmount([first, second], 5000n)?.id).to.equal('first')
    })
  })

  describe('resolveNextPeriod', () => {
    const now = new Date('2026-01-15T00:00:00Z')

    it('starts a fresh period when the subscriber has none', () => {
      const { start, end } = resolveNextPeriod(makePlan({ periodDays: 30 }), undefined, now)

      expect(start.toISOString()).to.equal(now.toISOString())
      expect(end.toISOString()).to.equal('2026-02-14T00:00:00.000Z')
    })

    it('stacks onto the remaining time when renewing the same plan early', () => {
      // 17 days still paid for; renewing must not discard them.
      const existing = makeSubscription({ currentPeriodEnd: new Date('2026-02-01T00:00:00Z') })

      const { start, end } = resolveNextPeriod(makePlan({ periodDays: 30 }), existing, now)

      expect(start.toISOString()).to.equal('2026-02-01T00:00:00.000Z')
      expect(end.toISOString()).to.equal('2026-03-03T00:00:00.000Z')
    })

    it('starts from now when the previous period has lapsed', () => {
      const existing = makeSubscription({ currentPeriodEnd: new Date('2026-01-01T00:00:00Z') })

      const { start } = resolveNextPeriod(makePlan({ periodDays: 30 }), existing, now)

      expect(start.toISOString()).to.equal(now.toISOString())
    })

    it('starts from now when changing to a different plan', () => {
      const existing = makeSubscription({ planId: 'premium', currentPeriodEnd: new Date('2026-02-01T00:00:00Z') })

      const { start } = resolveNextPeriod(makePlan({ id: 'vip', periodDays: 30 }), existing, now)

      expect(start.toISOString()).to.equal(now.toISOString())
    })

    it('stacks when the driver returns the period end as a string', () => {
      const existing = makeSubscription({ currentPeriodEnd: '2026-02-01T00:00:00Z' as unknown as Date })

      const { start } = resolveNextPeriod(makePlan({ periodDays: 30 }), existing, now)

      expect(start.toISOString()).to.equal('2026-02-01T00:00:00.000Z')
    })

    it('starts from now when the stored period end is unreadable', () => {
      const existing = makeSubscription({ currentPeriodEnd: 'not-a-date' as unknown as Date })

      const { start } = resolveNextPeriod(makePlan({ periodDays: 30 }), existing, now)

      expect(start.toISOString()).to.equal(now.toISOString())
    })

    it('starts from now when there is no stored period end at all', () => {
      const existing = makeSubscription({ currentPeriodEnd: undefined as unknown as Date })

      const { start } = resolveNextPeriod(makePlan({ periodDays: 30 }), existing, now)

      expect(start.toISOString()).to.equal(now.toISOString())
    })
  })
})
