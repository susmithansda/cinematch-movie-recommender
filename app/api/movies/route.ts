import { getMovieCatalog } from "../../../lib/movie-provider";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const catalog = await getMovieCatalog({
    category: params.get("category") || undefined,
    genre: params.get("genre") || undefined,
    q: params.get("q") || undefined,
    country: params.get("country") || undefined,
  });
  return Response.json(catalog, {
    headers: { "Cache-Control": catalog.live ? "public, max-age=60, s-maxage=600" : "no-store" },
  });
}
