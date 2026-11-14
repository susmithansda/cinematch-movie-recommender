import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("sessions_user_id_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const passwordResets = sqliteTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("password_resets_user_id_idx").on(table.userId), index("password_resets_expiry_idx").on(table.expiresAt)]);

export const authLimits = sqliteTable("auth_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEnd: integer("window_end").notNull(),
}, (table) => [index("auth_limits_expiry_idx").on(table.windowEnd)]);

export const watchlist = sqliteTable("watchlist", {
  ownerId: text("owner_id").notNull(),
  movieId: text("movie_id").notNull(),
  movieJson: text("movie_json").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.movieId] })]);
