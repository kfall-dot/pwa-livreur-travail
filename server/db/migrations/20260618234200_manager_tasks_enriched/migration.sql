ALTER TYPE "manager_task_type" ADD VALUE IF NOT EXISTS 'missed_delivery';--> statement-breakpoint
ALTER TYPE "manager_task_type" ADD VALUE IF NOT EXISTS 'partial_delivery';--> statement-breakpoint
ALTER TYPE "manager_task_type" ADD VALUE IF NOT EXISTS 'reassign_tour';--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD COLUMN IF NOT EXISTS "payload" jsonb;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD COLUMN IF NOT EXISTS "related_tour_id" text;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD COLUMN IF NOT EXISTS "related_driver_id" text;--> statement-breakpoint
UPDATE "manager_tasks" SET "title" = "description" WHERE "title" IS NULL;--> statement-breakpoint
ALTER TABLE "manager_tasks" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_related_tour_id_tours_id_fk" FOREIGN KEY ("related_tour_id") REFERENCES "public"."tours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_related_driver_id_drivers_id_fk" FOREIGN KEY ("related_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;
