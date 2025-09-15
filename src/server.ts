import { routeAgentRequest, type Schedule } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { env } from "cloudflare:workers";

// Cloudflare AI Gateway (optional baseURL). If GATEWAY_BASE_URL is not set,
// the AI SDK will use the provider's default.
const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.GATEWAY_BASE_URL || undefined
});

const model = openai("gpt-4o-2024-11-20");

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools()
    };

    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions
        });

        // Stream the AI response using GPT-4
        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks.

Travel Planner role:
- Help users plan trips end-to-end: suggest destinations/activities, compare flights and hotels, estimate budgets.
- Use the travel tools when appropriate:
  - searchFlights(origin, destination, departDate, returnDate?, passengers, cabin?, maxPrice?)
  - searchHotels(city, checkIn, checkOut, guests, roomCount?, budgetUSD?)
  - getRecommendations(interests?, month?, budgetUSD?)
  - estimateTravelBudget(flightMaxUSD?, hotelPerNightUSD?, nights?, activitiesUSD?, passengers?)
- For any purchase action, always use booking tools and require human confirmation:
  - bookFlight(flightId, passengers[], paymentToken?)
  - bookHotel(hotelId, guest, rooms, paymentToken?)
- Before booking, summarize the selection (dates, times, cabin/room, refundability, total price) and ask for explicit approval.
- After booking success, present confirmation IDs. If denied, gracefully continue planning.

Scheduling assistant:
${unstable_getSchedulePrompt({ date: new Date() })}
If the user asks to schedule a reminder (check-in reminders, airport transfer, etc.), use the schedule tool to schedule the task.
`,
          messages: processedMessages,
          tools: allTools,
          onFinish: async (args) => {
            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
            // await this.mcp.closeConnection(mcpConnection.id);
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      }
    });

    return dataStreamResponse;
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date()
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }

    // Simple Amadeus readiness check: verifies env vars and token fetch
    if (url.pathname === "/check-amadeus") {
      const hasKeys = !!env.AMADEUS_CLIENT_ID && !!env.AMADEUS_CLIENT_SECRET;
      if (!hasKeys) {
        return Response.json(
          { ok: false, reason: "Missing AMADEUS credentials" },
          { status: 400 }
        );
      }
      try {
        const body = new URLSearchParams({
          grant_type: "client_credentials",
          client_id: env.AMADEUS_CLIENT_ID!,
          client_secret: env.AMADEUS_CLIENT_SECRET!
        });
        const res = await fetch(
          "https://test.api.amadeus.com/v1/security/oauth2/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body
          }
        );
        const ok = res.ok;
        const json: any = ok ? await res.json() : { error: await res.text() };
        return Response.json(
          {
            ok,
            hasKeys,
            tokenPreview: ok
              ? String(json.access_token || "").slice(0, 8)
              : undefined,
            error: ok ? undefined : json
          },
          { status: ok ? 200 : 502 }
        );
      } catch (e: any) {
        return Response.json(
          { ok: false, hasKeys: true, error: String(e) },
          { status: 500 }
        );
      }
    }

    if (!env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
