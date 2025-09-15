// Augment Cloudflare Workers Env with our custom variables
// This file is picked up by TypeScript for type-checking only.
declare interface Env {
  AMADEUS_CLIENT_ID?: string;
  AMADEUS_CLIENT_SECRET?: string;
  DISABLE_TRAVEL_MOCKS?: string; // when "true", disable mock fallbacks and return empty results on failure
}
