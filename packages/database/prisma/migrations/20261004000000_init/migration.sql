-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETING');

-- CreateEnum
CREATE TYPE "theme_preference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "plan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "subscription_store" AS ENUM ('APPLE', 'GOOGLE', 'WEB', 'MANUAL');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('TERMS', 'PRIVACY', 'OPEN_FINANCE', 'MARKETING');

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('CHECKING', 'SAVINGS', 'WALLET', 'DIGITAL', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "data_origin" AS ENUM ('MANUAL', 'OPEN_FINANCE');

-- CreateEnum
CREATE TYPE "card_brand" AS ENUM ('VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'OTHER');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('OPEN', 'CLOSED', 'PAID');

-- CreateEnum
CREATE TYPE "category_type" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'POSTED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('PIX', 'DEBIT', 'CREDIT', 'CASH', 'BOLETO', 'TED_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "transfer_side" AS ENUM ('OUT', 'IN');

-- CreateEnum
CREATE TYPE "recurrence_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "goal_kind" AS ENUM ('EMERGENCY_FUND', 'TRAVEL', 'VEHICLE', 'HOME', 'EDUCATION', 'RETIREMENT', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "open_finance_provider" AS ENUM ('PLUGGY');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('CONNECTING', 'ACTIVE', 'OUTDATED', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "bank_transaction_direction" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "bank_transaction_status" AS ENUM ('NEW', 'MATCHED', 'IMPORTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('BILL_DUE', 'INVOICE_DUE', 'BUDGET_NEAR_LIMIT', 'BUDGET_EXCEEDED', 'GOAL_PROGRESS', 'GOAL_ACHIEVED', 'TRANSACTION_SYNCED', 'SYNC_FAILED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "push_platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "privacy_request_type" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "privacy_request_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(100),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "theme" "theme_preference" NOT NULL DEFAULT 'SYSTEM',
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan" "plan" NOT NULL DEFAULT 'FREE',
    "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',
    "store" "subscription_store" NOT NULL DEFAULT 'MANUAL',
    "external_id" TEXT,
    "current_period_end" TIMESTAMPTZ(6),
    "trial_ends_at" TIMESTAMPTZ(6),
    "canceled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "consent_type" NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "ip_hash" VARCHAR(64),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compe_code" VARCHAR(3),
    "ispb" VARCHAR(8),
    "name" VARCHAR(120) NOT NULL,
    "short_name" VARCHAR(40),
    "logo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "bank_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "type" "account_type" NOT NULL,
    "opening_balance_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "color" VARCHAR(7),
    "icon" VARCHAR(40),
    "include_in_total" BOOLEAN NOT NULL DEFAULT true,
    "source" "data_origin" NOT NULL DEFAULT 'MANUAL',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "bank_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "brand" "card_brand" NOT NULL DEFAULT 'OTHER',
    "last4" CHAR(4),
    "limit_cents" BIGINT NOT NULL,
    "closing_day" SMALLINT NOT NULL,
    "due_day" SMALLINT NOT NULL,
    "pay_account_id" UUID,
    "color" VARCHAR(7),
    "icon" VARCHAR(40),
    "source" "data_origin" NOT NULL DEFAULT 'MANUAL',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "reference_month" DATE NOT NULL,
    "closing_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "paid_on" DATE NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "category_type" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "icon" VARCHAR(40) NOT NULL DEFAULT 'tag',
    "color" VARCHAR(7) NOT NULL DEFAULT '#94A3B8',
    "parent_id" UUID,
    "system_key" VARCHAR(40),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'POSTED',
    "description" VARCHAR(200) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "account_id" UUID,
    "card_id" UUID,
    "category_id" UUID,
    "payment_method" "payment_method" NOT NULL DEFAULT 'OTHER',
    "invoice_id" UUID,
    "installment_group_id" UUID,
    "installment_no" SMALLINT,
    "installment_total" SMALLINT,
    "transfer_id" UUID,
    "transfer_side" "transfer_side",
    "recurrence_id" UUID,
    "bank_transaction_id" UUID,
    "notes" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "account_id" UUID,
    "card_id" UUID,
    "category_id" UUID,
    "payment_method" "payment_method" NOT NULL DEFAULT 'OTHER',
    "frequency" "recurrence_frequency" NOT NULL,
    "interval_count" SMALLINT NOT NULL DEFAULT 1,
    "day_of_month" SMALLINT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_run_on" DATE NOT NULL,
    "last_run_on" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "alert_pct" SMALLINT NOT NULL DEFAULT 80,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "goal_kind" NOT NULL DEFAULT 'OTHER',
    "target_cents" BIGINT NOT NULL,
    "initial_cents" BIGINT NOT NULL DEFAULT 0,
    "deadline" DATE,
    "status" "goal_status" NOT NULL DEFAULT 'ACTIVE',
    "icon" VARCHAR(40),
    "color" VARCHAR(7),
    "achieved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_contributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "notes" VARCHAR(500),
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "open_finance_provider" NOT NULL,
    "provider_item_id" VARCHAR(128) NOT NULL,
    "institution_name" VARCHAR(120) NOT NULL,
    "bank_id" UUID,
    "status" "connection_status" NOT NULL DEFAULT 'CONNECTING',
    "consent_granted_at" TIMESTAMPTZ(6),
    "consent_expires_at" TIMESTAMPTZ(6),
    "last_sync_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_connection_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider_account_id" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(120),
    "account_id" UUID,
    "card_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_connection_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider_account_id" VARCHAR(128) NOT NULL,
    "provider_tx_id" VARCHAR(128) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "direction" "bank_transaction_direction" NOT NULL,
    "posted_on" DATE NOT NULL,
    "description_raw" VARCHAR(500) NOT NULL,
    "status" "bank_transaction_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "data" JSONB,
    "dedupe_key" VARCHAR(120),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "expo_token" TEXT NOT NULL,
    "platform" "push_platform" NOT NULL,
    "device_name" VARCHAR(100),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "type" "privacy_request_type" NOT NULL,
    "status" "privacy_request_status" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "export_file_path" TEXT,
    "export_expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60),
    "entity_id" VARCHAR(64),
    "ip_hash" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "open_finance_provider" NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "error" VARCHAR(500),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_store_external_id_key" ON "subscriptions"("store", "external_id");

-- CreateIndex
CREATE INDEX "consents_user_id_type_granted_at_idx" ON "consents"("user_id", "type", "granted_at");

-- CreateIndex
CREATE UNIQUE INDEX "banks_compe_code_key" ON "banks"("compe_code");

-- CreateIndex
CREATE UNIQUE INDEX "banks_ispb_key" ON "banks"("ispb");

-- CreateIndex
CREATE INDEX "accounts_user_id_deleted_at_idx" ON "accounts"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "accounts_bank_id_idx" ON "accounts"("bank_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_id_key" ON "accounts"("user_id", "id");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_deleted_at_idx" ON "credit_cards"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "credit_cards_bank_id_idx" ON "credit_cards"("bank_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_user_id_id_key" ON "credit_cards"("user_id", "id");

-- CreateIndex
CREATE INDEX "invoices_user_id_due_date_idx" ON "invoices"("user_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_card_id_reference_month_key" ON "invoices"("card_id", "reference_month");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_user_id_id_key" ON "invoices"("user_id", "id");

-- CreateIndex
CREATE INDEX "invoice_payments_user_id_invoice_id_idx" ON "invoice_payments"("user_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payments_user_id_account_id_paid_on_idx" ON "invoice_payments"("user_id", "account_id", "paid_on");

-- CreateIndex
CREATE INDEX "categories_user_id_type_deleted_at_idx" ON "categories"("user_id", "type", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_id_key" ON "categories"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_system_key_key" ON "categories"("user_id", "system_key");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_on_id_idx" ON "transactions"("user_id", "occurred_on", "id");

-- CreateIndex
CREATE INDEX "transactions_user_id_account_id_occurred_on_idx" ON "transactions"("user_id", "account_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transactions_user_id_card_id_occurred_on_idx" ON "transactions"("user_id", "card_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_occurred_on_idx" ON "transactions"("user_id", "category_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transactions_user_id_type_occurred_on_idx" ON "transactions"("user_id", "type", "occurred_on");

-- CreateIndex
CREATE INDEX "transactions_user_id_updated_at_idx" ON "transactions"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "transactions_invoice_id_idx" ON "transactions"("invoice_id");

-- CreateIndex
CREATE INDEX "transactions_installment_group_id_idx" ON "transactions"("installment_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_id_key" ON "transactions"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_bank_transaction_id_key" ON "transactions"("user_id", "bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurrence_id_occurred_on_key" ON "transactions"("recurrence_id", "occurred_on");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transfer_id_transfer_side_key" ON "transactions"("transfer_id", "transfer_side");

-- CreateIndex
CREATE INDEX "transfers_user_id_occurred_on_idx" ON "transfers"("user_id", "occurred_on");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_user_id_id_key" ON "transfers"("user_id", "id");

-- CreateIndex
CREATE INDEX "recurring_rules_active_next_run_on_idx" ON "recurring_rules"("active", "next_run_on");

-- CreateIndex
CREATE INDEX "recurring_rules_user_id_active_idx" ON "recurring_rules"("user_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_rules_user_id_id_key" ON "recurring_rules"("user_id", "id");

-- CreateIndex
CREATE INDEX "budgets_user_id_month_idx" ON "budgets"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_key" ON "budgets"("user_id", "category_id", "month");

-- CreateIndex
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "goals_user_id_id_key" ON "goals"("user_id", "id");

-- CreateIndex
CREATE INDEX "goal_contributions_user_id_goal_id_occurred_on_idx" ON "goal_contributions"("user_id", "goal_id", "occurred_on");

-- CreateIndex
CREATE INDEX "bank_connections_user_id_status_idx" ON "bank_connections"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connections_provider_provider_item_id_key" ON "bank_connections"("provider", "provider_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connections_user_id_id_key" ON "bank_connections"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connection_accounts_connection_id_provider_account_id_key" ON "bank_connection_accounts"("connection_id", "provider_account_id");

-- CreateIndex
CREATE INDEX "bank_transactions_user_id_status_posted_on_idx" ON "bank_transactions"("user_id", "status", "posted_on");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_connection_id_provider_tx_id_key" ON "bank_transactions"("connection_id", "provider_tx_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_user_id_id_key" ON "bank_transactions"("user_id", "id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_expo_token_key" ON "push_tokens"("expo_token");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "privacy_requests_user_id_type_idx" ON "privacy_requests"("user_id", "type");

-- CreateIndex
CREATE INDEX "privacy_requests_status_requested_at_idx" ON "privacy_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_pay_account_id_fkey" FOREIGN KEY ("user_id", "pay_account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_card_id_fkey" FOREIGN KEY ("user_id", "card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_user_id_invoice_id_fkey" FOREIGN KEY ("user_id", "invoice_id") REFERENCES "invoices"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_parent_id_fkey" FOREIGN KEY ("user_id", "parent_id") REFERENCES "categories"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_card_id_fkey" FOREIGN KEY ("user_id", "card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "categories"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_invoice_id_fkey" FOREIGN KEY ("user_id", "invoice_id") REFERENCES "invoices"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_transfer_id_fkey" FOREIGN KEY ("user_id", "transfer_id") REFERENCES "transfers"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_recurrence_id_fkey" FOREIGN KEY ("user_id", "recurrence_id") REFERENCES "recurring_rules"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_bank_transaction_id_fkey" FOREIGN KEY ("user_id", "bank_transaction_id") REFERENCES "bank_transactions"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_from_account_id_fkey" FOREIGN KEY ("user_id", "from_account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_to_account_id_fkey" FOREIGN KEY ("user_id", "to_account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_card_id_fkey" FOREIGN KEY ("user_id", "card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "categories"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "categories"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_goal_id_fkey" FOREIGN KEY ("user_id", "goal_id") REFERENCES "goals"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_transaction_id_fkey" FOREIGN KEY ("user_id", "transaction_id") REFERENCES "transactions"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_user_id_connection_id_fkey" FOREIGN KEY ("user_id", "connection_id") REFERENCES "bank_connections"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connection_accounts" ADD CONSTRAINT "bank_connection_accounts_user_id_card_id_fkey" FOREIGN KEY ("user_id", "card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_user_id_connection_id_fkey" FOREIGN KEY ("user_id", "connection_id") REFERENCES "bank_connections"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
