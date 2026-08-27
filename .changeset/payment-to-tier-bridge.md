---
"nostream": minor
---

feat(payments): grant tiered subscriptions from confirmed Lightning payments

Adds optional `payments.subscriptionPlans`. A confirmed payment is matched to
the most expensive enabled plan its amount covers, and the subscriber is granted
one billing period in the new `user_subscriptions` table. Renewing the same plan
before it lapses stacks onto the remaining time.

Works with every payment processor, since they all confirm through
`PaymentsService`. Relays with no plans configured are unaffected.
