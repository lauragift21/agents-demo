/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import {
  searchFlights as svcSearchFlights,
  searchHotels as svcSearchHotels,
  getRecommendations as svcGetRecommendations,
  estimateBudget as svcEstimateBudget,
  bookFlight as svcBookFlight,
  bookHotel as svcBookHotel
} from "./services/travel";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 * The actual implementation is in the executions object below
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  parameters: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  parameters: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

/**
 * Travel search tools (auto-executed)
 */
const searchFlights = tool({
  description:
    "Search available flights given origin, destination, dates, passenger count, cabin and optional max price (USD)",
  parameters: z.object({
    origin: z.string().min(3).max(3).describe("Origin IATA code, e.g. SFO"),
    destination: z
      .string()
      .min(3)
      .max(3)
      .describe("Destination IATA code, e.g. LIS"),
    departDate: z.string().describe("YYYY-MM-DD"),
    returnDate: z.string().optional().describe("YYYY-MM-DD for round-trip"),
    passengers: z.number().int().min(1).default(1),
    cabin: z
      .enum(["economy", "premium_economy", "business", "first"])
      .optional(),
    maxPrice: z.number().int().positive().optional()
  }),
  execute: async (args) => {
    const results = await svcSearchFlights(args);
    return results;
  }
});

const searchHotels = tool({
  description:
    "Search available hotels given city, dates, guests, optional room count and budget (USD)",
  parameters: z.object({
    city: z.string().min(2),
    checkIn: z.string().describe("YYYY-MM-DD"),
    checkOut: z.string().describe("YYYY-MM-DD"),
    guests: z.number().int().min(1).default(1),
    roomCount: z.number().int().min(1).optional(),
    budgetUSD: z.number().int().positive().optional()
  }),
  execute: async (args) => {
    const results = await svcSearchHotels(args);
    return results;
  }
});

const getRecommendations = tool({
  description:
    "Get destination/activity recommendations based on interests, month/season and budget",
  parameters: z.object({
    city: z.string().optional(),
    interests: z.array(z.string()).optional(),
    month: z.string().optional(),
    budgetUSD: z.number().int().positive().optional()
  }),
  execute: async (args) => {
    const recs = await svcGetRecommendations(args);
    return recs;
  }
});

const estimateTravelBudget = tool({
  description:
    "Estimate total trip budget; include flight max, hotel per-night, nights, activities and passenger count",
  parameters: z.object({
    flightMaxUSD: z.number().int().positive().optional(),
    hotelPerNightUSD: z.number().int().positive().optional(),
    nights: z.number().int().positive().optional(),
    activitiesUSD: z.number().int().positive().optional(),
    passengers: z.number().int().positive().optional()
  }),
  execute: async (args) => {
    const est = await svcEstimateBudget(args);
    return est;
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  parameters: unstable_scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

/**
 * Booking tools (require confirmation): they are declared without execute.
 * The actual booking happens in the `executions` object below after approval.
 */
const bookFlight = tool({
  description:
    "Book a selected flight by id with passenger details. Requires human confirmation.",
  parameters: z.object({
    flightId: z.string(),
    passengers: z
      .array(
        z.object({ firstName: z.string().min(1), lastName: z.string().min(1) })
      )
      .min(1),
    paymentToken: z.string().optional()
  })
});

const bookHotel = tool({
  description:
    "Book a selected hotel by id with guest details and room count. Requires human confirmation.",
  parameters: z.object({
    hotelId: z.string(),
    guest: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1)
    }),
    rooms: z.number().int().min(1).default(1),
    paymentToken: z.string().optional()
  })
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  // Travel planning
  searchFlights,
  searchHotels,
  getRecommendations,
  estimateTravelBudget,
  // Scheduling utilities
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  // Booking (requires confirmation)
  bookFlight,
  bookHotel
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 * NOTE: keys below should match toolsRequiringConfirmation in app.tsx
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  },
  bookFlight: async ({
    flightId,
    passengers,
    paymentToken
  }: {
    flightId: string;
    passengers: { firstName: string; lastName: string }[];
    paymentToken?: string;
  }) => {
    const confirmation = await svcBookFlight({
      flightId,
      passengers,
      paymentToken
    });
    return confirmation;
  },
  bookHotel: async ({
    hotelId,
    guest,
    rooms,
    paymentToken
  }: {
    hotelId: string;
    guest: { firstName: string; lastName: string };
    rooms: number;
    paymentToken?: string;
  }) => {
    const confirmation = await svcBookHotel({
      hotelId,
      guest,
      rooms,
      paymentToken
    });
    return confirmation;
  }
};
