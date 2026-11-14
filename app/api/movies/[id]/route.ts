import { getMovieDetail } from "../../../../lib/movie-provider";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^(?:seed|tmdb|apple)-\d{1,15}$/.test(id)) return Response.json({ error: "Movie not found." }, { status: 404 });
  try {
    const movie = await getMovieDetail(id);
    if (!movie) return Response.json({ error: "Movie not found." }, { status: 404 });
    return Response.json({ movie }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ error: "Movie details are temporarily unavailable. Please try again." }, { status: 503 });
  }
}
