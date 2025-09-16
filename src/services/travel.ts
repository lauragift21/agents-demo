// Mock travel service with typed interfaces and stub data
import { env } from "cloudflare:workers";
// Use a relaxed view of env to avoid TS issues with custom keys in Env
const E = env as any;

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export interface FlightSearchParams {
  origin: string; // IATA code e.g. "SFO"
  destination: string; // IATA code e.g. "LIS"
  departDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD
  passengers: number;
  cabin?: CabinClass;
  maxPrice?: number; // in USD
}

// Resolve a human city name (e.g., "Lisbon") to a 3-letter city code (e.g., "LIS") using Amadeus Locations API
async function resolveCityToCode(token: string, input: string): Promise<string | null> {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  // If already a 3-letter code, use it as-is
  if (/^[A-Z]{3}$/.test(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }
  // Strategy: try Cities endpoint first (narrower), then generic Locations as a fallback
  const citiesParams = new URLSearchParams({ keyword: trimmed });
  const citiesRes = await fetch(
    `https://test.api.amadeus.com/v1/reference-data/locations/cities?${citiesParams.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (citiesRes.ok) {
    try {
      const cities = (await citiesRes.json()) as any;
      const firstCity = Array.isArray(cities?.data) ? cities.data[0] : null;
      if (firstCity?.iataCode) return String(firstCity.iataCode);
    } catch {}
  }

  const params = new URLSearchParams({ keyword: trimmed, subType: "CITY" });
  const res = await fetch(
    `https://test.api.amadeus.com/v1/reference-data/locations?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.error("Amadeus city resolve error", res.status, await safeText(res));
    return null;
  }
  const data = (await res.json()) as any;
  const first = Array.isArray(data?.data) ? data.data.find((d: any) => d?.iataCode) : null;
  return first?.iataCode ?? null;
}

// =============== Amadeus helpers ===============
async function getAmadeusAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });
  const res = await fetch(
    "https://test.api.amadeus.com/v1/security/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );
  if (!res.ok) {
    console.error("Amadeus auth error", res.status, await safeText(res));
    throw new Error(`Amadeus auth failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function parseISODurationToMinutes(dur?: string): number | undefined {
  if (!dur) return undefined;
  // rough parser for formats like PT10H30M
  const match = /P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/i.exec(
    dur
  );
  if (!match) return undefined;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}

function mapAmadeusOfferToFlightOption(offer: any): FlightOption {
  const itin = offer?.itineraries?.[0];
  const seg = itin?.segments?.[0];
  const lastSeg = itin?.segments?.[itin?.segments?.length - 1];
  const durationMinutes = parseISODurationToMinutes(itin?.duration) ?? 0;
  return {
    id: offer.id ?? `${seg?.carrierCode ?? "UNK"}-${seg?.number ?? "0000"}`,
    carrier: seg?.carrierCode ?? seg?.marketingCarrier ?? "UNK",
    flightNumber: `${seg?.number ?? "0000"}`,
    departTime: seg?.departure?.at ?? new Date().toISOString(),
    arriveTime: lastSeg?.arrival?.at ?? new Date().toISOString(),
    durationMinutes,
    stops: Math.max(0, (itin?.segments?.length ?? 1) - 1),
    cabin: "economy",
    priceUSD: Number(offer?.price?.total ?? 0)
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export interface FlightOption {
  id: string;
  carrier: string;
  flightNumber: string;
  departTime: string; // ISO
  arriveTime: string; // ISO
  durationMinutes: number;
  stops: number;
  cabin: CabinClass;
  priceUSD: number;
}

export interface HotelSearchParams {
  city: string; // City name
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  roomCount?: number;
  budgetUSD?: number;
}

export interface HotelOption {
  id: string;
  name: string;
  stars: number;
  location: string;
  checkIn: string; // ISO
  checkOut: string; // ISO
  pricePerNightUSD: number;
  totalUSD: number;
}

export interface BookFlightPayload {
  flightId: string;
  passengers: {
    firstName: string;
    lastName: string;
  }[];
  paymentToken?: string; // mock token for demo
}

export interface BookHotelPayload {
  hotelId: string;
  guest: {
    firstName: string;
    lastName: string;
  };
  rooms: number;
  paymentToken?: string;
}

export interface BookingConfirmation {
  confirmationId: string;
  provider: string;
  details: unknown;
}

// Mock database
const mockFlights: FlightOption[] = [
  {
    id: "FL-1",
    carrier: "CF",
    flightNumber: "CF123",
    departTime: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    arriveTime: new Date(
      Date.now() + 7 * 24 * 3600 * 1000 + 10 * 3600 * 1000
    ).toISOString(),
    durationMinutes: 600,
    stops: 0,
    cabin: "economy",
    priceUSD: 450
  },
  {
    id: "FL-2",
    carrier: "CF",
    flightNumber: "CF456",
    departTime: new Date(
      Date.now() + 7 * 24 * 3600 * 1000 + 2 * 3600 * 1000
    ).toISOString(),
    arriveTime: new Date(
      Date.now() + 7 * 24 * 3600 * 1000 + 14 * 3600 * 1000
    ).toISOString(),
    durationMinutes: 720,
    stops: 1,
    cabin: "economy",
    priceUSD: 380
  }
];

const mockHotels: HotelOption[] = [
  {
    id: "HT-1",
    name: "Lisbon Central Hotel",
    stars: 4,
    location: "Lisbon City Center",
    checkIn: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    checkOut: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(),
    pricePerNightUSD: 120,
    totalUSD: 600
  },
  {
    id: "HT-2",
    name: "Alfama Boutique",
    stars: 3,
    location: "Alfama, Lisbon",
    checkIn: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    checkOut: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(),
    pricePerNightUSD: 90,
    totalUSD: 450
  }
];

export async function searchFlights(
  params: FlightSearchParams
): Promise<FlightOption[]> {
  const hasAmadeus = !!E.AMADEUS_CLIENT_ID && !!E.AMADEUS_CLIENT_SECRET;
  const disableMocks = String(E.DISABLE_TRAVEL_MOCKS || "").toLowerCase() === "true";

  if (!hasAmadeus && !disableMocks) {
    // Fallback to mock
    return mockFlights
      .filter((f) => (params.maxPrice ? f.priceUSD <= params.maxPrice : true))
      .map((f) => ({ ...f, cabin: params.cabin ?? f.cabin }));
  }
  if (!hasAmadeus && disableMocks) {
    // Explicitly disable mocks: return empty results
    return [];
  }

  // Use Amadeus Flight Offers Search API (test env)
  const token = await getAmadeusAccessToken(E.AMADEUS_CLIENT_ID!, E.AMADEUS_CLIENT_SECRET!);

  const travelClass = (params.cabin ?? "economy")
    .toUpperCase()
    .replace("_", " ");
  const query = new URLSearchParams({
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.departDate,
    adults: String(params.passengers ?? 1),
    travelClass,
    currencyCode: "USD"
  });
  if (params.returnDate) query.set("returnDate", params.returnDate);
  if (params.maxPrice) query.set("maxPrice", String(params.maxPrice));

  const res = await fetch(
    `https://test.api.amadeus.com/v2/shopping/flight-offers?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!res.ok) {
    console.error("Amadeus search error", res.status, await safeText(res));
    if (disableMocks) return [];
    // Fallback to mock on error (unless disabled)
    return mockFlights
      .filter((f) => (params.maxPrice ? f.priceUSD <= params.maxPrice : true))
      .map((f) => ({ ...f, cabin: params.cabin ?? f.cabin }));
  }
  const data = (await res.json()) as any;
  const offers: any[] = data?.data ?? [];
  return offers
    .slice(0, 10)
    .map((offer) => mapAmadeusOfferToFlightOption(offer));
}

export async function searchHotels(
  params: HotelSearchParams
): Promise<HotelOption[]> {
  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(params.checkOut).getTime() -
        new Date(params.checkIn).getTime()) /
        (24 * 3600 * 1000)
    )
  );

  const hasAmadeus = !!E.AMADEUS_CLIENT_ID && !!E.AMADEUS_CLIENT_SECRET;
  const disableMocks = String(E.DISABLE_TRAVEL_MOCKS || "").toLowerCase() === "true";
  if (!hasAmadeus && !disableMocks) {
    // No credentials available: keep mock fallback
    return mockHotels
      .map((h) => ({ ...h, totalUSD: h.pricePerNightUSD * nights }))
      .filter((h) =>
        params.budgetUSD ? h.totalUSD <= params.budgetUSD : true
      );
  }
  if (!hasAmadeus && disableMocks) {
    return [];
  }

  const token = await getAmadeusAccessToken(E.AMADEUS_CLIENT_ID!, E.AMADEUS_CLIENT_SECRET!);

  // Resolve city to a cityCode if needed
  const cityCode = await resolveCityToCode(token, params.city);
  if (!cityCode) {
    if (disableMocks) return [];
    // If we couldn't resolve the city, fallback gracefully to mock
    return mockHotels
      .map((h) => ({ ...h, totalUSD: h.pricePerNightUSD * nights }))
      .filter((h) =>
        params.budgetUSD ? h.totalUSD <= params.budgetUSD : true
      );
  }
  
  // Step 1: Get hotelIds for the city (Amadeus requires hotelIds for v3 offers)
  const hotelsRes = await fetch(
    `https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(
      cityCode
    )}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!hotelsRes.ok) {
    console.error("Amadeus by-city hotels error", hotelsRes.status, await safeText(hotelsRes));
    if (disableMocks) return [];
    return mockHotels
      .map((h) => ({ ...h, totalUSD: h.pricePerNightUSD * nights }))
      .filter((h) => (params.budgetUSD ? h.totalUSD <= params.budgetUSD : true));
  }
  const hotelsData: any = await hotelsRes.json();
  const hotelIds: string[] = Array.isArray(hotelsData?.data)
    ? hotelsData.data
        .map((h: any) => h?.hotelId)
        .filter((id: any) => typeof id === "string")
    : [];
  // Limit number of IDs to keep URL reasonable
  const limitedHotelIds = hotelIds.slice(0, 20);
  if (limitedHotelIds.length === 0) {
    if (disableMocks) return [];
    return mockHotels
      .map((h) => ({ ...h, totalUSD: h.pricePerNightUSD * nights }))
      .filter((h) => (params.budgetUSD ? h.totalUSD <= params.budgetUSD : true));
  }

  // Debug logging for query
  try {
    console.log(
      `[Hotels] Resolved city "${params.city}" to code ${cityCode} | hotelIds ${limitedHotelIds.length} | dates ${params.checkIn} -> ${params.checkOut} | guests ${params.guests} | rooms ${params.roomCount ?? 1}`
    );
  } catch {}

  const query = new URLSearchParams({
    hotelIds: limitedHotelIds.join(","),
    checkInDate: params.checkIn,
    checkOutDate: params.checkOut,
    adults: String(params.guests ?? 1),
    currencyCode: "USD"
  });
  if (params.roomCount && params.roomCount > 0) {
    query.set("roomQuantity", String(params.roomCount));
  }

  const res = await fetch(
    `https://test.api.amadeus.com/v3/shopping/hotel-offers?${query.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.error(
      "Amadeus hotel search error",
      res.status,
      await safeText(res)
    );
    if (disableMocks) return [];
    return mockHotels
      .map((h) => ({ ...h, totalUSD: h.pricePerNightUSD * nights }))
      .filter((h) =>
        params.budgetUSD ? h.totalUSD <= params.budgetUSD : true
      );
  }
  const data = (await res.json()) as any;
  const list: any[] = data?.data ?? [];
  const mapped = list
    .flatMap((entry) =>
      (entry.offers || []).map((offer: any) =>
        mapAmadeusHotelOfferToHotelOption(entry, offer)
      )
    )
    .map((h) => ({ ...h, totalUSD: Math.round(h.totalUSD) }))
    .filter((h) => (params.budgetUSD ? h.totalUSD <= params.budgetUSD : true));
  return mapped.slice(0, 10);
}

export async function getRecommendations(input: {
  interests?: string[];
  month?: string; // e.g. "October"
  budgetUSD?: number;
}): Promise<string[]> {
  return [
    "Try a day trip to Sintra and Cabo da Roca",
    "Visit Jerónimos Monastery and Belém Tower",
    "Explore Time Out Market for food options"
  ];
}

export async function estimateBudget(input: {
  flightMaxUSD?: number;
  hotelPerNightUSD?: number;
  nights?: number;
  activitiesUSD?: number;
  passengers?: number;
}): Promise<{ totalUSD: number; breakdown: Record<string, number> }> {
  const flight = input.flightMaxUSD ?? 500;
  const hotel = (input.hotelPerNightUSD ?? 120) * (input.nights ?? 4);
  const activities = input.activitiesUSD ?? 200;
  const pax = input.passengers ?? 1;
  const total = pax * (flight + hotel + activities);
  return {
    totalUSD: total,
    breakdown: {
      flight: flight * pax,
      hotel: hotel * pax,
      activities: activities * pax
    }
  };
}

export async function bookFlight(
  payload: BookFlightPayload
): Promise<BookingConfirmation> {
  return {
    confirmationId: `CONF-FLT-${payload.flightId}-${Date.now()}`,
    provider: "MockAir",
    details: payload
  };
}

export async function bookHotel(
  payload: BookHotelPayload
): Promise<BookingConfirmation> {
  return {
    confirmationId: `CONF-HTL-${payload.hotelId}-${Date.now()}`,
    provider: "MockStay",
    details: payload
  };
}

function mapAmadeusHotelOfferToHotelOption(
  hotelEntry: any,
  offer: any
): HotelOption {
  const name = hotelEntry?.hotel?.name ?? "Hotel";
  const rating = Number(hotelEntry?.hotel?.rating ?? 0);
  const location = [
    hotelEntry?.hotel?.address?.cityName,
    hotelEntry?.hotel?.address?.countryCode
  ]
    .filter(Boolean)
    .join(", ");
  const checkIn = offer?.checkInDate ?? new Date().toISOString();
  const checkOut = offer?.checkOutDate ?? new Date().toISOString();
  const pricePerNightUSD = Number(
    offer?.price?.variations?.average?.base ?? offer?.price?.base ?? 0
  );
  const totalUSD = Number(offer?.price?.total ?? pricePerNightUSD);
  return {
    id: `${hotelEntry?.hotel?.hotelId ?? hotelEntry?.hotel?.chainCode ?? "HT"}-${offer?.id ?? "0"}`,
    name,
    stars: isNaN(rating) ? 0 : rating,
    location,
    checkIn,
    checkOut,
    pricePerNightUSD,
    totalUSD
  };
}
