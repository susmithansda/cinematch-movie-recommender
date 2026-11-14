import { currentUser, endpoint, json } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const GET = endpoint(async request => json({ user: await currentUser(request) }));
