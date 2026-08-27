import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import knex from 'knex'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { DatabaseClient } from '../../../src/@types/base'
import { IUserSubscriptionRepository } from '../../../src/@types/repositories'
import { UserSubscriptionRepository } from '../../../src/repositories/user-subscription-repository'

chai.use(sinonChai)
chai.use(chaiAsPromised)

const { expect } = chai

describe('UserSubscriptionRepository', () => {
  let repository: IUserSubscriptionRepository
  let sandbox: sinon.SinonSandbox
  let dbClient: DatabaseClient

  const pubkeyHex = '22e804d26ed16b68db5259e78449e96dab5d464c8f470bda3eb1a70467f2c793'
  const fixedDate = new Date('2026-01-01T00:00:00.000Z')
  const periodEnd = new Date('2026-01-31T00:00:00.000Z')

  const dbRow = {
    pubkey: Buffer.from(pubkeyHex, 'hex'),
    plan_id: 'premium',
    current_period_start: fixedDate,
    current_period_end: periodEnd,
    last_invoice_id: 'invoice-1',
    created_at: fixedDate,
    updated_at: fixedDate,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.useFakeTimers(fixedDate.getTime())
    dbClient = knex({ client: 'pg' })
    repository = new UserSubscriptionRepository(dbClient)
  })

  afterEach(() => {
    dbClient.destroy()
    sandbox.restore()
  })

  describe('.findByPubkey', () => {
    it('returns undefined when the subscriber has no row', async () => {
      const client = sandbox.stub().returns({
        where: sandbox.stub().returns({ select: sandbox.stub().resolves([]) }),
      }) as unknown as DatabaseClient

      await expect(repository.findByPubkey(pubkeyHex, client)).to.eventually.be.undefined
    })

    it('returns the subscription with the pubkey decoded to hex', async () => {
      const client = sandbox.stub().returns({
        where: sandbox.stub().returns({ select: sandbox.stub().resolves([dbRow]) }),
      }) as unknown as DatabaseClient

      const result = await repository.findByPubkey(pubkeyHex, client)

      expect(result?.pubkey).to.equal(pubkeyHex)
      expect(result?.planId).to.equal('premium')
      expect(result?.currentPeriodEnd).to.equal(periodEnd)
      expect(result?.lastInvoiceId).to.equal('invoice-1')
    })

    it('queries user_subscriptions by the pubkey as bytes', async () => {
      const whereStub = sandbox.stub().returns({ select: sandbox.stub().resolves([]) })
      const client = sandbox.stub().returns({ where: whereStub }) as unknown as DatabaseClient

      await repository.findByPubkey(pubkeyHex, client)

      expect(client).to.have.been.calledWith('user_subscriptions')
      expect(whereStub).to.have.been.calledWith('pubkey', Buffer.from(pubkeyHex, 'hex'))
    })
  })

  describe('.upsert', () => {
    const makeClient = () => {
      const merge = sandbox.stub().resolves()
      const onConflict = sandbox.stub().returns({ merge })
      const insert = sandbox.stub().returns({ onConflict })
      const client = sandbox.stub().returns({ insert }) as unknown as DatabaseClient

      return { client, insert, onConflict, merge }
    }

    it('inserts the granted period against the subscriber', async () => {
      const { client, insert } = makeClient()

      await repository.upsert(
        {
          pubkey: pubkeyHex,
          planId: 'premium',
          currentPeriodStart: fixedDate,
          currentPeriodEnd: periodEnd,
          lastInvoiceId: 'invoice-1',
        },
        client,
      )

      expect(client).to.have.been.calledWith('user_subscriptions')
      const [row] = insert.firstCall.args
      expect(row.pubkey).to.deep.equal(Buffer.from(pubkeyHex, 'hex'))
      expect(row.plan_id).to.equal('premium')
      expect(row.current_period_start).to.equal(fixedDate)
      expect(row.current_period_end).to.equal(periodEnd)
      expect(row.last_invoice_id).to.equal('invoice-1')
    })

    it('overwrites the existing period on conflict rather than failing', async () => {
      const { client, onConflict, merge } = makeClient()

      await repository.upsert(
        {
          pubkey: pubkeyHex,
          planId: 'vip',
          currentPeriodStart: fixedDate,
          currentPeriodEnd: periodEnd,
        },
        client,
      )

      expect(onConflict).to.have.been.calledWith('pubkey')
      expect(merge).to.have.been.calledWith([
        'plan_id',
        'current_period_start',
        'current_period_end',
        'last_invoice_id',
        'updated_at',
      ])
    })

    it('stores a null invoice id when none is given', async () => {
      const { client, insert } = makeClient()

      await repository.upsert(
        {
          pubkey: pubkeyHex,
          planId: 'premium',
          currentPeriodStart: fixedDate,
          currentPeriodEnd: periodEnd,
        },
        client,
      )

      expect(insert.firstCall.args[0].last_invoice_id).to.be.null
    })

    it('returns the stored subscription', async () => {
      const { client } = makeClient()

      const result = await repository.upsert(
        {
          pubkey: pubkeyHex,
          planId: 'premium',
          currentPeriodStart: fixedDate,
          currentPeriodEnd: periodEnd,
          lastInvoiceId: 'invoice-1',
        },
        client,
      )

      expect(result.pubkey).to.equal(pubkeyHex)
      expect(result.planId).to.equal('premium')
      expect(result.currentPeriodEnd).to.equal(periodEnd)
    })
  })
})
