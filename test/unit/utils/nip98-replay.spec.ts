import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import Sinon from 'sinon'

import {
  claimNip98AuthEventId,
  nip98AuthReplayCacheKey,
  resetNip98ReplayCacheAdapterForTests,
} from '../../../src/utils/nip98-replay'

chai.use(chaiAsPromised)

const { expect } = chai

describe('nip98-replay', () => {
  afterEach(() => {
    resetNip98ReplayCacheAdapterForTests()
    Sinon.restore()
  })

  it('builds a stable cache key', () => {
    expect(nip98AuthReplayCacheKey('abc')).to.equal('nip98:auth:abc')
  })

  it('claims a fresh event id', async () => {
    const cache = {
      setKeyIfNotExists: Sinon.stub().resolves(true),
    }

    await expect(claimNip98AuthEventId('event-id', 60, cache as any)).to.eventually.equal('claimed')
    expect(cache.setKeyIfNotExists).to.have.been.calledOnceWithExactly('nip98:auth:event-id', '1', 60)
  })

  it('detects replays when NX set fails', async () => {
    const cache = {
      setKeyIfNotExists: Sinon.stub().resolves(false),
    }

    await expect(claimNip98AuthEventId('event-id', 60, cache as any)).to.eventually.equal('replay')
  })

  it('fails closed when redis throws', async () => {
    const cache = {
      setKeyIfNotExists: Sinon.stub().rejects(new Error('redis down')),
    }

    await expect(claimNip98AuthEventId('event-id', 60, cache as any)).to.eventually.equal('unavailable')
  })
})
