-- 1. Alter users and customer_profiles tables
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pin_hash" TEXT;

ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "ciudad" TEXT;
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "ocupacion" TEXT CHECK (ocupacion IN ('empleado', 'independiente', 'pensionado', 'otro'));
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "ingresos_mensuales" NUMERIC;

-- 2. Alter notifications table to support custom columns
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "tipo" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "mensaje" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "leida" BOOLEAN DEFAULT false;

-- 3. Create solicitudes_credito table
CREATE TABLE IF NOT EXISTS "solicitudes_credito" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "usuario_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "producto_id" TEXT NOT NULL,
  "datos_enviados" JSONB NOT NULL,
  "url_documento_cedula" TEXT,
  "url_documento_ingresos" TEXT,
  "aprobada" BOOLEAN NOT NULL,
  "motivo" TEXT,
  "score_simulado" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

-- 4. Create tarjetas_credito table
CREATE TABLE IF NOT EXISTS "tarjetas_credito" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "usuario_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "solicitud_id" UUID REFERENCES "solicitudes_credito"("id"),
  "producto_id" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'aprobada' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  "cupo_asignado" NUMERIC NOT NULL,
  "gastado" NUMERIC NOT NULL DEFAULT 0,
  "numero" TEXT NOT NULL,
  "cvv" TEXT NOT NULL,
  "vence" TEXT NOT NULL,
  "motivo_decision" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

-- 5. Create tarjetas_debito table
CREATE TABLE IF NOT EXISTS "tarjetas_debito" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "usuario_id" UUID REFERENCES "users"("id") ON DELETE CASCADE UNIQUE,
  "numero" TEXT NOT NULL,
  "cvv" TEXT NOT NULL,
  "cvv_actualizado_en" TIMESTAMPTZ DEFAULT now(),
  "vence" TEXT NOT NULL,
  "saldo" NUMERIC NOT NULL DEFAULT 0,
  "acumulado_gmf_mes" NUMERIC NOT NULL DEFAULT 0,
  "mes_acumulado" INTEGER DEFAULT extract(month from now()),
  "created_at" TIMESTAMPTZ DEFAULT now()
);

-- 6. Create bolsillos table
CREATE TABLE IF NOT EXISTS "bolsillos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tarjeta_debito_id" UUID REFERENCES "tarjetas_debito"("id") ON DELETE CASCADE,
  "nombre" TEXT NOT NULL,
  "limite" NUMERIC,
  "icono" TEXT DEFAULT 'otro',
  "saldo_usado" NUMERIC NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

-- 7. Create transacciones_debito table
CREATE TABLE IF NOT EXISTS "transacciones_debito" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tarjeta_debito_id" UUID REFERENCES "tarjetas_debito"("id") ON DELETE CASCADE,
  "bolsillo_id" UUID REFERENCES "bolsillos"("id"),
  "tipo" TEXT NOT NULL CHECK (tipo IN ('retiro','transferencia','pago_debito','pago_tarjeta_credito','deposito')),
  "monto" NUMERIC NOT NULL,
  "gmf" NUMERIC NOT NULL DEFAULT 0,
  "monto_total_debitado" NUMERIC NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);
