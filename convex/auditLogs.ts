import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    action: v.optional(v.string()),
    search: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db.query("auditLogs").order("desc").paginate(args.paginationOpts);
    let filtered = result.page;

    if (args.action) filtered = filtered.filter((l) => l.action === args.action);
    if (args.search) {
      const s = args.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.description?.toLowerCase().includes(s) ||
          l.userName?.toLowerCase().includes(s) ||
          l.userEmail?.toLowerCase().includes(s) ||
          l.entityId?.toLowerCase().includes(s)
      );
    }
    if (args.startDate) {
      const start = new Date(args.startDate).getTime();
      filtered = filtered.filter((l) => l._creationTime >= start);
    }
    if (args.endDate) {
      const end = new Date(args.endDate).getTime() + 86400000;
      filtered = filtered.filter((l) => l._creationTime < end);
    }

    return { ...result, page: filtered };
  },
});

export const listAll = query({
  args: {
    action: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    let logs = await ctx.db.query("auditLogs").order("desc").take(2000);
    if (args.action) logs = logs.filter((l) => l.action === args.action);
    if (args.startDate) {
      const start = new Date(args.startDate).getTime();
      logs = logs.filter((l) => l._creationTime >= start);
    }
    if (args.endDate) {
      const end = new Date(args.endDate).getTime() + 86400000;
      logs = logs.filter((l) => l._creationTime < end);
    }
    return logs;
  },
});

export const addLog = mutation({
  args: {
    action: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    description: v.string(),
    oldValues: v.optional(v.string()),
    newValues: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const user = identity
      ? await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique()
      : null;

    return await ctx.db.insert("auditLogs", {
      ...args,
      userId: user?._id,
      userEmail: user?.email,
      userName: user?.name,
    });
  },
});
