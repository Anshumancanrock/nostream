// `confirm_invoice` has always been idempotent: it only writes when
// "confirmed_at" is NULL, so a replayed confirmation cannot credit a balance
// twice. It signalled nothing about that to its caller though — it returned a
// constant 0 — so callers could not tell a first confirmation apart from a
// replay and had to treat every call as if the payment had just cleared.
//
// Return 1 when this call applied the confirmation and 0 when it was a no-op,
// so post-payment side effects can run exactly once per invoice.
exports.up = function (knex) {
  return knex.schema.raw(`CREATE OR REPLACE FUNCTION confirm_invoice(invoice_id TEXT, amount_received BIGINT, confirmation_date TIMESTAMP WITHOUT TIME ZONE)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  payee BYTEA;
  confirmed_date TIMESTAMP WITHOUT TIME ZONE;
  invoice_unit TEXT;
BEGIN
  PERFORM ASSERT_SERIALIZED();

  SELECT "pubkey", "confirmed_at", "unit" INTO payee, confirmed_date, invoice_unit FROM "invoices" WHERE id = invoice_id;
  IF confirmed_date IS NULL THEN
      UPDATE invoices
      SET
        "confirmed_at" = confirmation_date,
        "amount_paid" = amount_received,
        "updated_at" = now_utc()
      WHERE id = invoice_id;
      IF invoice_unit = 'sats' THEN
        UPDATE users SET balance = balance + amount_received * 1000 WHERE "pubkey" = payee;
      ELSIF invoice_unit = 'msats' THEN
        UPDATE users SET balance = balance + amount_received WHERE "pubkey" = payee;
      ELSIF invoice_unit = 'btc' THEN
        UPDATE users SET balance = balance + amount_received * 100000000 * 1000 WHERE "pubkey" = payee;
      END IF;
      RETURN 1;
  END IF;
  RETURN 0;
END;
$$;`)
}

exports.down = function (knex) {
  return knex.schema.raw(`CREATE OR REPLACE FUNCTION confirm_invoice(invoice_id TEXT, amount_received BIGINT, confirmation_date TIMESTAMP WITHOUT TIME ZONE)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  payee BYTEA;
  confirmed_date TIMESTAMP WITHOUT TIME ZONE;
  invoice_unit TEXT;
BEGIN
  PERFORM ASSERT_SERIALIZED();

  SELECT "pubkey", "confirmed_at", "unit" INTO payee, confirmed_date, invoice_unit FROM "invoices" WHERE id = invoice_id;
  IF confirmed_date IS NULL THEN
      UPDATE invoices
      SET
        "confirmed_at" = confirmation_date,
        "amount_paid" = amount_received,
        "updated_at" = now_utc()
      WHERE id = invoice_id;
      IF invoice_unit = 'sats' THEN
        UPDATE users SET balance = balance + amount_received * 1000 WHERE "pubkey" = payee;
      ELSIF invoice_unit = 'msats' THEN
        UPDATE users SET balance = balance + amount_received WHERE "pubkey" = payee;
      ELSIF invoice_unit = 'btc' THEN
        UPDATE users SET balance = balance + amount_received * 100000000 * 1000 WHERE "pubkey" = payee;
      END IF;
  END IF;
  RETURN 0;
END;
$$;`)
}
