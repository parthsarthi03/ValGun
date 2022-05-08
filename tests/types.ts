export interface PoliticianRating {
  pubkey: string;
  politician: string;
  rating: number;
  signature: string | null;
}

export interface Politician {
  name: string;
  score: number;
  ratingCount: number;
}
