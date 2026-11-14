import { finishOAuth } from "@/lib/oauth";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return finishOAuth(request, "facebook"); }
