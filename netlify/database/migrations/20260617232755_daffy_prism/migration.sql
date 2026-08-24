CREATE TYPE "declaration_outcome" AS ENUM('full', 'partial', 'rejected');--> statement-breakpoint
CREATE TYPE "delivery_status" AS ENUM('pending', 'in_progress', 'otp_sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "driver_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "unit_type" AS ENUM('palette', 'carton', 'sac', 'colis', 'bidon');--> statement-breakpoint
CREATE TABLE "certificates" (
	"receipt_id" text PRIMARY KEY,
	"delivery_id" text NOT NULL,
	"certificate_url" text NOT NULL,
	"is_partial" boolean DEFAULT false NOT NULL,
	"is_rejected" boolean DEFAULT false NOT NULL,
	"accepted_palettes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "declarations" (
	"delivery_id" text PRIMARY KEY,
	"outcome" "declaration_outcome" NOT NULL,
	"lines" jsonb NOT NULL,
	"declared_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_points" (
	"id" text PRIMARY KEY,
	"tour_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"instructions" text,
	"status" "delivery_status" DEFAULT 'pending'::"delivery_status" NOT NULL,
	"units" integer NOT NULL,
	"unit_type" "unit_type" DEFAULT 'palette'::"unit_type" NOT NULL,
	"weight_kg" numeric(8,2) DEFAULT '0' NOT NULL,
	"order_ref" text NOT NULL,
	"distance_from_prev_m" integer DEFAULT 0 NOT NULL,
	"time_window_start" time,
	"time_window_end" time,
	"estimated_arrival" time,
	"lat" numeric(10,7) NOT NULL,
	"lng" numeric(10,7) NOT NULL,
	"contact_phone" text,
	"required_photos" integer DEFAULT 1 NOT NULL,
	"receipt_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY,
	"phone" text NOT NULL UNIQUE,
	"pin_hash" text,
	"name" text NOT NULL,
	"status" "driver_status" DEFAULT 'pending'::"driver_status" NOT NULL,
	"invite_token" text,
	"invite_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"delivery_id" text PRIMARY KEY,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_hashes" (
	"hash" text PRIMARY KEY,
	"delivery_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"driver_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"id" text PRIMARY KEY,
	"driver_id" text NOT NULL,
	"date" text NOT NULL,
	"depot_name" text NOT NULL,
	"depot_address" text NOT NULL,
	"depot_lat" numeric(10,7) NOT NULL,
	"depot_lng" numeric(10,7) NOT NULL,
	"optimization_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_delivery_id_delivery_points_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery_points"("id");--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_delivery_id_delivery_points_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery_points"("id");--> statement-breakpoint
ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_tour_id_tours_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id");--> statement-breakpoint
ALTER TABLE "otps" ADD CONSTRAINT "otps_delivery_id_delivery_points_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery_points"("id");--> statement-breakpoint
ALTER TABLE "photo_hashes" ADD CONSTRAINT "photo_hashes_delivery_id_delivery_points_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery_points"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_driver_id_drivers_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id");--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_driver_id_drivers_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id");