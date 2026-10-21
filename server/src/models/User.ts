import { Schema, model, InferSchemaType, Types } from "mongoose";

export const ROLES = ["ADMIN", "INSPECTOR", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model("User", userSchema);

export function publicUser(u: { _id: unknown; name: string; email: string; role: string; active?: boolean; createdAt?: Date; lastLoginAt?: Date | null }) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    active: u.active ?? true,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}
