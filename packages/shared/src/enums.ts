import { z } from "zod";

// Espelho dos enums do Prisma (packages/database). Um teste na API garante que não divergem.

function make<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values);
}

export const UserRole = make(["USER", "ADMIN"]);
export const UserStatus = make(["ACTIVE", "SUSPENDED", "DELETING"]);
export const ThemePreference = make(["SYSTEM", "LIGHT", "DARK"]);
export const Plan = make(["FREE", "PREMIUM"]);
export const ConsentType = make(["TERMS", "PRIVACY", "OPEN_FINANCE", "MARKETING"]);
export const AccountType = make(["CHECKING", "SAVINGS", "WALLET", "DIGITAL", "INVESTMENT"]);
export const DataOrigin = make(["MANUAL", "OPEN_FINANCE"]);
export const CardBrand = make(["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OTHER"]);
export const InvoiceStatus = make(["OPEN", "CLOSED", "PAID"]);
export const CategoryType = make(["EXPENSE", "INCOME"]);
export const TransactionType = make(["INCOME", "EXPENSE", "TRANSFER"]);
export const TransactionStatus = make(["PENDING", "POSTED"]);
export const PaymentMethod = make(["PIX", "DEBIT", "CREDIT", "CASH", "BOLETO", "TED_DOC", "OTHER"]);
export const TransferSide = make(["OUT", "IN"]);
export const RecurrenceFrequency = make(["WEEKLY", "MONTHLY", "YEARLY"]);
export const GoalKind = make([
  "EMERGENCY_FUND", "TRAVEL", "VEHICLE", "HOME", "EDUCATION", "RETIREMENT", "EVENT", "OTHER",
]);
export const GoalStatus = make(["ACTIVE", "ACHIEVED", "ARCHIVED"]);
export const OpenFinanceProvider = make(["PLUGGY"]);
export const ConnectionStatus = make(["CONNECTING", "ACTIVE", "OUTDATED", "ERROR", "REVOKED"]);
export const BankTransactionDirection = make(["CREDIT", "DEBIT"]);
export const BankTransactionStatus = make(["NEW", "MATCHED", "IMPORTED", "IGNORED"]);
export const NotificationType = make([
  "BILL_DUE", "INVOICE_DUE", "BUDGET_NEAR_LIMIT", "BUDGET_EXCEEDED",
  "GOAL_PROGRESS", "GOAL_ACHIEVED", "TRANSACTION_SYNCED", "SYNC_FAILED", "SYSTEM",
]);
export const PushPlatform = make(["IOS", "ANDROID"]);
export const PrivacyRequestType = make(["EXPORT", "DELETE"]);
export const PrivacyRequestStatus = make(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);

export type TransactionTypeValue = z.infer<typeof TransactionType>;
export type PaymentMethodValue = z.infer<typeof PaymentMethod>;
export type CategoryTypeValue = z.infer<typeof CategoryType>;
export type AccountTypeValue = z.infer<typeof AccountType>;
export type GoalKindValue = z.infer<typeof GoalKind>;

/** Todos os enums, para o teste de paridade com o Prisma. */
export const ALL_ENUMS = {
  UserRole, UserStatus, ThemePreference, Plan, ConsentType, AccountType, DataOrigin, CardBrand,
  InvoiceStatus, CategoryType, TransactionType, TransactionStatus, PaymentMethod, TransferSide,
  RecurrenceFrequency, GoalKind, GoalStatus, OpenFinanceProvider, ConnectionStatus,
  BankTransactionDirection, BankTransactionStatus, NotificationType, PushPlatform,
  PrivacyRequestType, PrivacyRequestStatus,
} as const;

/** Rótulos em português para a interface. */
export const PAYMENT_METHOD_LABEL_PT: Record<PaymentMethodValue, string> = {
  PIX: "Pix",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  CASH: "Dinheiro",
  BOLETO: "Boleto",
  TED_DOC: "TED/DOC",
  OTHER: "Outro",
};

export const ACCOUNT_TYPE_LABEL_PT: Record<AccountTypeValue, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  WALLET: "Carteira",
  DIGITAL: "Conta digital",
  INVESTMENT: "Investimentos",
};

export const GOAL_KIND_LABEL_PT: Record<GoalKindValue, string> = {
  EMERGENCY_FUND: "Reserva de emergência",
  TRAVEL: "Viagem",
  VEHICLE: "Veículo",
  HOME: "Casa",
  EDUCATION: "Educação",
  RETIREMENT: "Aposentadoria",
  EVENT: "Evento",
  OTHER: "Outro",
};
