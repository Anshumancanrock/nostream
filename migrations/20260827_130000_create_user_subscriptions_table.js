// One row per pubkey describing the billing period their last payment bought.
//
// A subscription is "active" when current_period_end is in the future; there is
// deliberately no status column, because nothing in this change maintains one.
// Lifecycle states (past_due, grace, cancelled) arrive with the renewal worker
// that will own the transitions.
exports.up = function (knex) {
  return knex.schema.createTable('user_subscriptions', (table) => {
    table.binary('pubkey').primary()
    // text, not varchar(n): plan ids are operator-controlled and invoice ids come
    // from the payment processor (invoices.id is itself text). A value over a
    // length limit would abort the confirming transaction, leaving a paid
    // invoice permanently unconfirmed.
    table.text('plan_id').notNullable()
    table.timestamp('current_period_start', { useTz: true }).notNullable()
    table.timestamp('current_period_end', { useTz: true }).notNullable()
    // Traceability from a granted period back to the payment that bought it.
    table.text('last_invoice_id').nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Supports the expiry sweep the renewal worker will run.
    table.index(['current_period_end'], 'idx_user_subscriptions_current_period_end')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('user_subscriptions')
}
