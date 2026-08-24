-- Jean Livreur (tests Québec 418) + renommage du livreur démo si besoin
-- Appliquer : docker exec -i livraison-postgres psql -U livraison -d livraison < scripts/seed-jean-livreur.sql

-- Jean Livreur (tests Québec 418) — un seul compte actif
UPDATE users SET name = 'Jean Martin', active = false
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

INSERT INTO users (id, company_id, role, phone, name, pin_hash, active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440000',
  'driver',
  '+14185551234',
  'Jean Livreur',
  '$2b$10$ilcLeMTOrV0EbW9MpsSy2.ArcJ9RKSUTDYMUsqopRQxfJmeUN6t.S',
  true
)
ON CONFLICT (id) DO UPDATE SET
  phone = EXCLUDED.phone,
  name = EXCLUDED.name,
  pin_hash = EXCLUDED.pin_hash,
  active = true;
