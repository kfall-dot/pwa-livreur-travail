-- Revision PDG d'une demande d'achat : suivi de version (option A)
--  - purchase_requests.version / eb_version : numero de revision courante
--  - purchase_requests.revision_comment / revised_at : trace de la derniere revision
--  - purchase_request_versions : historique (snapshot des lignes a chaque revision)
--  - approval_decision gagne la valeur 'revised'
alter table purchase_requests add column if not exists version integer not null default 1;
alter table purchase_requests add column if not exists eb_version integer not null default 1;
alter table purchase_requests add column if not exists revision_comment text;
alter table purchase_requests add column if not exists revised_at timestamp;

create table if not exists purchase_request_versions (
  id text primary key not null,
  purchase_request_id text not null references purchase_requests(id) on delete cascade,
  version integer not null,
  lines jsonb not null,
  comment text,
  created_by_manager_id text references managers(id),
  created_at timestamp not null default now()
);

alter type approval_decision add value if not exists 'revised';
