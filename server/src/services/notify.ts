import { Types } from "mongoose";
import { Notification, User, Role } from "../models";

interface Payload {
  type: string;
  title: string;
  message?: string;
  link?: string;
  issue?: Types.ObjectId | string;
}

export async function notifyUsers(userIds: (Types.ObjectId | string)[], p: Payload) {
  if (!userIds.length) return;
  await Notification.insertMany(userIds.map((user) => ({ user, ...p, message: p.message ?? "", link: p.link ?? "" })));
}

export async function notifyRole(role: Role, p: Payload) {
  const users = await User.find({ role, active: true }).select("_id").lean();
  await notifyUsers(users.map((u) => u._id), p);
}
