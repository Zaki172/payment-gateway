import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.string(), // owner | manager | accounts | staff | viewer
    isActive: v.boolean(),
    lastLoginAt: v.optional(v.string()),
    singleTransactionLimit: v.optional(v.number()),
    dailyTransactionLimit: v.optional(v.number()),
    monthlyTransactionLimit: v.optional(v.number()),
    approvalThreshold: v.optional(v.number()),
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_role", ["role"]),

  customers: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    internalCustomerId: v.optional(v.string()),
    totalPaidAmount: v.number(),
    paymentCount: v.number(),
    lastPaymentAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    isActive: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_name", ["name"])
    .index("by_internalId", ["internalCustomerId"]),

  payments: defineTable({
    paymentNumber: v.string(),
    customerId: v.id("customers"),
    createdBy: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    status: v.string(),
    purpose: v.string(),
    description: v.optional(v.string()),
    bookingReference: v.optional(v.string()),
    invoiceReference: v.optional(v.string()),
    internalNote: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    paidAt: v.optional(v.string()),
    failedAt: v.optional(v.string()),
    cancelledAt: v.optional(v.string()),
    stripeMode: v.string(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.string()),
    totalRefunded: v.number(),
  })
    .index("by_paymentNumber", ["paymentNumber"])
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"])
    .index("by_stripeSessionId", ["stripeCheckoutSessionId"]),

  paymentLinks: defineTable({
    paymentId: v.id("payments"),
    stripeCheckoutSessionId: v.string(),
    checkoutUrl: v.string(),
    status: v.string(),
    expiresAt: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_payment", ["paymentId"])
    .index("by_stripeSession", ["stripeCheckoutSessionId"]),

  paymentEvents: defineTable({
    paymentId: v.id("payments"),
    eventType: v.string(),
    description: v.string(),
    performedBy: v.optional(v.id("users")),
    metadata: v.optional(v.string()),
    isSystem: v.boolean(),
  }).index("by_payment", ["paymentId"]),

  refunds: defineTable({
    refundNumber: v.string(),
    paymentId: v.id("payments"),
    requestedBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    rejectedBy: v.optional(v.id("users")),
    originalAmount: v.number(),
    refundAmount: v.number(),
    currency: v.string(),
    reason: v.string(),
    internalNote: v.optional(v.string()),
    status: v.string(),
    stripeRefundId: v.optional(v.string()),
    approvedAt: v.optional(v.string()),
    rejectedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_payment", ["paymentId"])
    .index("by_status", ["status"])
    .index("by_refundNumber", ["refundNumber"]),

  paymentApprovals: defineTable({
    paymentId: v.id("payments"),
    requestedBy: v.id("users"),
    reviewedBy: v.optional(v.id("users")),
    status: v.string(),
    reviewedAt: v.optional(v.string()),
    note: v.optional(v.string()),
  }).index("by_payment", ["paymentId"]).index("by_status", ["status"]),

  auditLogs: defineTable({
    userId: v.optional(v.id("users")),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    action: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    oldValues: v.optional(v.string()),
    newValues: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    description: v.string(),
  })
    .index("by_action", ["action"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_user", ["userId"]),

  webhookEvents: defineTable({
    stripeEventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
    status: v.string(),
    processedAt: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  }).index("by_stripeEventId", ["stripeEventId"]),

  notifications: defineTable({
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    type: v.string(),
    isRead: v.boolean(),
    paymentId: v.optional(v.id("payments")),
    refundId: v.optional(v.id("refunds")),
  })
    .index("by_user", ["userId"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_user_and_payment", ["userId", "paymentId"]),

  paymentCounters: defineTable({
    dateKey: v.string(),
    count: v.number(),
  }).index("by_dateKey", ["dateKey"]),

  stripeSettings: defineTable({
    isConnected: v.boolean(),
    mode: v.string(),
    lastWebhookAt: v.optional(v.string()),
    webhookHealthy: v.boolean(),
    accountDisplayName: v.optional(v.string()),
  }),
});
