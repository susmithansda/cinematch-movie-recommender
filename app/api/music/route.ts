import { getMusicCatalog } from "../../../lib/music-provider";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") || "";
  if (Array.from(q.normalize("NFC")).length > 120) {
    return Response.json({ error: "Keep song searches within 120 characters." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const catalog = await getMusicCatalog({ language: params.get("language") || "en", q });
  return Response.json(catalog, {
    headers: { "Cache-Control": catalog.live ? "public, max-age=60, s-maxage=300" : "no-store" },
  });
}
