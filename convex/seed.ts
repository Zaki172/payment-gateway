import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seedData = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if already seeded
    const existingCustomers = await ctx.db.query("customers").take(1);
    if (existingCustomers.length > 0) return "already_seeded";

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return "unauthenticated";

    const owner = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!owner) return "no_user";

    // Create additional demo users
    const managerId = await ctx.db.insert("users", {
      tokenIdentifier: "demo|manager001",
      name: "Rayhan Kabir",
      email: "rayhan@izumiglobal.jp",
      role: "manager",
      isActive: true,
      approvalThreshold: 500000,
    });

    const staffId = await ctx.db.insert("users", {
      tokenIdentifier: "demo|staff001",
      name: "Mitu Akter",
      email: "mitu@izumiglobal.jp",
      role: "staff",
      isActive: true,
      singleTransactionLimit: 300000,
      dailyTransactionLimit: 1000000,
      approvalThreshold: 300000,
    });

    const staff2Id = await ctx.db.insert("users", {
      tokenIdentifier: "demo|staff002",
      name: "Riyadh Islam",
      email: "riyadh@izumiglobal.jp",
      role: "staff",
      isActive: true,
      singleTransactionLimit: 300000,
      dailyTransactionLimit: 1000000,
      approvalThreshold: 300000,
    });

    const accountsId = await ctx.db.insert("users", {
      tokenIdentifier: "demo|accounts001",
      name: "Nadia Begum",
      email: "nadia@izumiglobal.jp",
      role: "accounts",
      isActive: true,
    });

    // Initialize stripe settings
    await ctx.db.insert("stripeSettings", {
      isConnected: false,
      mode: "test",
      webhookHealthy: false,
    });

    // Create customers
    const c1 = await ctx.db.insert("customers", {
      name: "Rahim Ahmed",
      email: "rahim@example.com",
      phone: "+81-80-1234-5678",
      internalCustomerId: "CUST-001",
      totalPaidAmount: 85000 + 124000,
      paymentCount: 3,
      lastPaymentAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      createdBy: owner._id,
      isActive: true,
    });
    const c2 = await ctx.db.insert("customers", {
      name: "Karim Hasan",
      email: "karim@example.com",
      phone: "+81-90-2345-6789",
      internalCustomerId: "CUST-002",
      totalPaidAmount: 0,
      paymentCount: 1,
      createdBy: managerId,
      isActive: true,
    });
    const c3 = await ctx.db.insert("customers", {
      name: "Sadia Rahman",
      email: "sadia@example.com",
      phone: "+81-70-3456-7890",
      internalCustomerId: "CUST-003",
      totalPaidAmount: 67500,
      paymentCount: 2,
      lastPaymentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      createdBy: staffId,
      isActive: true,
    });
    const c4 = await ctx.db.insert("customers", {
      name: "Hasan Ali",
      email: "hasan@example.com",
      phone: "+81-80-4567-8901",
      internalCustomerId: "CUST-004",
      totalPaidAmount: 0,
      paymentCount: 1,
      createdBy: staff2Id,
      isActive: true,
    });
    const c5 = await ctx.db.insert("customers", {
      name: "Mizanur Rahman",
      email: "mizanur@example.com",
      phone: "+81-90-5678-9012",
      internalCustomerId: "CUST-005",
      totalPaidAmount: 98000,
      paymentCount: 2,
      lastPaymentAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      createdBy: owner._id,
      isActive: true,
    });

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // Helper to create payment with events
    const makePayment = async (
      pn: string,
      customerId: typeof c1,
      createdBy: typeof owner._id,
      amount: number,
      currency: string,
      purpose: string,
      bookingRef: string,
      status: string,
      offsetMs: number,
      paidAt?: string
    ) => {
      const pid = await ctx.db.insert("payments", {
        paymentNumber: pn,
        customerId,
        createdBy,
        amount,
        currency,
        status,
        purpose,
        bookingReference: bookingRef,
        description: `${purpose} - ${bookingRef}`,
        stripeMode: "test",
        totalRefunded: 0,
        checkoutUrl: status !== "draft" ? `https://checkout.stripe.com/c/pay/test_${pn.replace(/-/g, "")}` : undefined,
        stripeCheckoutSessionId: status !== "draft" ? `cs_test_${pn.replace(/-/g, "")}` : undefined,
        stripePaymentIntentId: status === "paid" ? `pi_test_${pn.replace(/-/g, "")}` : undefined,
        cardBrand: status === "paid" ? "visa" : undefined,
        cardLast4: status === "paid" ? "4242" : undefined,
        paymentMethod: status === "paid" ? "card" : undefined,
        paidAt,
      });

      await ctx.db.insert("paymentEvents", {
        paymentId: pid,
        eventType: "created",
        description: "Payment created",
        performedBy: createdBy,
        isSystem: false,
      });

      if (status !== "draft" && status !== "approval_required") {
        await ctx.db.insert("paymentEvents", {
          paymentId: pid,
          eventType: "link_created",
          description: "Payment link created via Stripe Checkout",
          performedBy: createdBy,
          isSystem: false,
        });
      }

      if (status === "paid" && paidAt) {
        await ctx.db.insert("paymentEvents", {
          paymentId: pid,
          eventType: "paid",
          description: "Payment confirmed by Stripe",
          isSystem: true,
        });
      }

      if (status === "failed") {
        await ctx.db.insert("paymentEvents", {
          paymentId: pid,
          eventType: "failed",
          description: "Payment failed — card declined",
          isSystem: true,
        });
      }

      if (status === "refunded") {
        await ctx.db.insert("paymentEvents", {
          paymentId: pid,
          eventType: "refund_completed",
          description: "Full refund processed via Stripe",
          isSystem: true,
        });
        // Create refund record
        const now2 = new Date();
        const rdate = now2.toISOString().slice(0, 10).replace(/-/g, "");
        await ctx.db.insert("refunds", {
          refundNumber: `RFD-${rdate}-0001`,
          paymentId: pid,
          requestedBy: createdBy,
          approvedBy: managerId,
          originalAmount: amount,
          refundAmount: amount,
          currency,
          reason: "Customer requested cancellation",
          status: "completed",
          approvedAt: paidAt,
          completedAt: paidAt,
        });
      }

      return pid;
    };

    // Counter for payment numbering
    const dateKey = "20260814";
    await ctx.db.insert("paymentCounters", { dateKey, count: 5 });

    await makePayment("IZP-20260814-0001", c1, owner._id, 85000, "JPY", "Air Ticket", "NTT-260814-001", "paid",
      0, new Date(now.getTime() - 2 * 60 * 1000).toISOString());
    await makePayment("IZP-20260814-0002", c2, managerId, 124000, "JPY", "Air Ticket", "NTT-260814-002", "pending",
      -12 * 60 * 1000);
    await makePayment("IZP-20260814-0003", c3, staffId, 67500, "JPY", "Visa Service", "NTT-260814-003", "paid",
      -40 * 60 * 1000, new Date(now.getTime() - 20 * 60 * 1000).toISOString());
    await makePayment("IZP-20260814-0004", c4, staff2Id, 52000, "JPY", "Tour Package", "NTT-260814-004", "failed",
      -3 * 60 * 60 * 1000);
    const p5 = await makePayment("IZP-20260813-0005", c5, owner._id, 98000, "JPY", "Hotel Booking", "NTT-260813-005", "refunded",
      -dayMs, new Date(now.getTime() - 22 * 60 * 60 * 1000).toISOString());
    void p5;

    // More historical data for chart
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getTime() - i * dayMs);
      const dk = d.toISOString().slice(0, 10).replace(/-/g, "");
      await ctx.db.insert("paymentCounters", { dateKey: dk, count: Math.floor(Math.random() * 5) + 2 });
    }

    void accountsId;
    return "seeded";
  },
});

export const getStripeSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.query("stripeSettings").first();
  },
});

export const updateStripeSettings = mutation({
  args: {
    isConnected: v.optional(v.boolean()),
    mode: v.optional(v.string()),
    accountDisplayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db.query("stripeSettings").first();
    if (settings) {
      await ctx.db.patch(settings._id, args);
    } else {
      await ctx.db.insert("stripeSettings", {
        isConnected: args.isConnected ?? false,
        mode: args.mode ?? "test",
        webhookHealthy: false,
        accountDisplayName: args.accountDisplayName,
      });
    }
  },
});
