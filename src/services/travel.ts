// Mock travel service with typed interfaces and stub data

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
    arriveTime: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 10 * 3600 * 1000).toISOString(),
    durationMinutes: 600,
    stops: 0,
    cabin: "economy",
    priceUSD: 450
  },
  {
    id: "FL-2",
    carrier: "CF",
    flightNumber: "CF456",
    departTime: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString(),
    arriveTime: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 14 * 3600 * 1000).toISOString(),
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

export async function searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
  // Filter by simple rules for demo
  return mockFlights
    .filter((f) => (params.maxPrice ? f.priceUSD <= params.maxPrice : true))
    .map((f) => ({ ...f, cabin: params.cabin ?? f.cabin }));
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOption[]> {
  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) /
        (24 * 3600 * 1000)
    )
  );
  return mockHotels
    .map((h) => ({ ...h, totalUSD: h.pricePerNightUSD * nights }))
    .filter((h) => (params.budgetUSD ? h.totalUSD <= params.budgetUSD : true));
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
  return { totalUSD: total, breakdown: { flight: flight * pax, hotel: hotel * pax, activities: activities * pax } };
}

export async function bookFlight(payload: BookFlightPayload): Promise<BookingConfirmation> {
  return {
    confirmationId: `CONF-FLT-${payload.flightId}-${Date.now()}`,
    provider: "MockAir",
    details: payload
  };
}

export async function bookHotel(payload: BookHotelPayload): Promise<BookingConfirmation> {
  return {
    confirmationId: `CONF-HTL-${payload.hotelId}-${Date.now()}`,
    provider: "MockStay",
    details: payload
  };
}
