import { getMasterDbClient, getReadReplicaDbClient } from '../database/client'
import { createPaymentsProcessor } from './payments-processor-factory'
import { createSettings } from './settings-factory'
import { EventRepository } from '../repositories/event-repository'
import { InvoiceRepository } from '../repositories/invoice-repository'
import { PaymentsService } from '../services/payments-service'
import { UserRepository } from '../repositories/user-repository'
import { UserSubscriptionRepository } from '../repositories/user-subscription-repository'

export const createPaymentsService = () => {
  const dbClient = getMasterDbClient()
  const rrDbClient = getReadReplicaDbClient()
  const invoiceRepository = new InvoiceRepository(dbClient)
  const eventRepository = new EventRepository(dbClient, rrDbClient)
  const userRepository = new UserRepository(dbClient, eventRepository)
  const userSubscriptionRepository = new UserSubscriptionRepository(dbClient)
  const paymentsProcessor = createPaymentsProcessor()

  return new PaymentsService(
    dbClient,
    paymentsProcessor,
    userRepository,
    invoiceRepository,
    userSubscriptionRepository,
    eventRepository,
    createSettings,
  )
}
