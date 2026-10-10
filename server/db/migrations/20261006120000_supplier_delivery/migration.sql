-- Livraison fournisseur directe sur chantier (approche A) :
--  - drivers.is_virtual distingue le livreur virtuel « fournisseur »
--    (téléphone sentinelle unique + aucun PIN → impossible de se connecter)
--  - tours.delivery_source trace l'origine ('driver' | 'supplier')
alter table drivers add column if not exists is_virtual boolean not null default false;
alter table tours add column if not exists delivery_source text not null default 'driver';
