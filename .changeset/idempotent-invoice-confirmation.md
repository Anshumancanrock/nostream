---
"nostream": patch
---

fix(payments): only run admission once per confirmed invoice

`confirm_invoice` now reports whether it applied the confirmation, so a replayed
payment notification no longer re-runs post-payment work. Payment processor
callbacks and the maintenance worker's poll of pending invoices can both fire
for the same payment.
