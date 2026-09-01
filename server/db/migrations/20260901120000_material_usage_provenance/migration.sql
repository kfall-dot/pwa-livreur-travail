-- Provenance (texte libre) pour une consommation de matériau « Autre » non livré.
ALTER TABLE site_material_usages ADD COLUMN IF NOT EXISTS provenance text;