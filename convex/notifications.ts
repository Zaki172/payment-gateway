import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique();
    if (!user) return [];
    return await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(50);
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isRead: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique();
    if (!user) return;
    const notifs = await ctx.db.query("notifications").withIndex("by_user_unread", (q) => q.eq("userId", user._id).eq("isRead", false)).collect();
    await Promise.all(notifs.map((n) => ctx.db.patch(n._id, { isRead: true })));
  },
});
