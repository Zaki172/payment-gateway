import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
        lastLoginAt: new Date().toISOString(),
      });
      return existing._id;
    }

    // Count existing users to assign owner role to first user
    const allUsers = await ctx.db.query("users").collect();
    const role = allUsers.length === 0 ? "owner" : "staff";

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
      role,
      isActive: true,
      lastLoginAt: new Date().toISOString(),
    });

    return userId;
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db.query("users").collect();
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    singleTransactionLimit: v.optional(v.number()),
    dailyTransactionLimit: v.optional(v.number()),
    approvalThreshold: v.optional(v.number()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const editor = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!editor || !["owner", "manager"].includes(editor.role)) {
      throw new ConvexError({ message: "Insufficient permissions", code: "FORBIDDEN" });
    }

    const { userId, ...updates } = args;
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await ctx.db.patch(userId, updates);

    // Audit log
    const changes: string[] = [];
    if (updates.role && updates.role !== target.role) changes.push(`role: ${target.role} → ${updates.role}`);
    if (updates.isActive !== undefined && updates.isActive !== target.isActive)
      changes.push(`status: ${target.isActive ? "active" : "inactive"} → ${updates.isActive ? "active" : "inactive"}`);
    if (updates.singleTransactionLimit !== undefined) changes.push(`tx limit: ${updates.singleTransactionLimit}`);

    if (changes.length > 0) {
      await ctx.db.insert("auditLogs", {
        userId: editor._id,
        userEmail: editor.email,
        userName: editor.name,
        action: "user_updated",
        entityType: "user",
        entityId: userId,
        description: `${target.name ?? "User"} updated — ${changes.join(", ")}`,
      });
    }
  },
});
