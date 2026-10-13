-- Lot 2 : un BT par ligne comptant.
--  - treasury_orders.purchase_request_line_id : la ligne EB financée par ce BT.
--    Les BT existants (agrégés, ligne NULL) sont conservés tels quels.
ALTER TABLE treasury_orders ADD COLUMN IF NOT EXISTS purchase_request_line_id text REFERENCES purchase_request_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_treasury_orders_line ON treasury_orders(purchase_request_line_id);

-- Un seul BT vivant par ligne : les lignes historisées (deleted_at) ne comptent pas.
CREATE UNIQUE INDEX IF NOT EXISTS treasury_orders_line_uidx
  ON treasury_orders(purchase_request_id, purchase_request_line_id)
  WHERE purchase_request_line_id IS NOT NULL;
