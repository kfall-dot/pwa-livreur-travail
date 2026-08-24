CREATE TYPE "manager_task_type" AS ENUM('delivery_failed', 'delivery_partial', 'delivery_cancelled', 'delivery_confirmed');--> statement-breakpoint
CREATE TYPE "product_unit" AS ENUM('palette', 'kg', 'colis', 'caisse', 'plateau', 'unite');--> statement-breakpoint
CREATE TABLE "manager_tasks" (
	"id" text PRIMARY KEY,
	"type" "manager_task_type" NOT NULL,
	"delivery_id" text,
	"description" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"unit" "product_unit" DEFAULT 'palette'::"product_unit" NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermarkets" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"lat" numeric(10,7),
	"lng" numeric(10,7),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_delivery_id_delivery_points_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery_points"("id");