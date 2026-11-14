import { beginOAuth } from "@/lib/oauth";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return beginOAuth(request, "google"); }
