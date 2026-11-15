import type { Movie } from "@/lib/movies";

export type DiaryEntry = {
  movie: Movie;
  /** The member's own 1–5 star score, separate from the movie provider's score. */
  rating: number | null;
  note: string;
  watchedAt: string;
};
