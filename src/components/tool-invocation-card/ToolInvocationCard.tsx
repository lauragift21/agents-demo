import { useState } from "react";
import { Robot, CaretDown } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { APPROVAL } from "@/shared";

interface ToolInvocation {
  toolName: string;
  toolCallId: string;
  state: "call" | "result" | "partial-call";
  step?: number;
  args: Record<string, unknown>;
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
}

interface ToolInvocationCardProps {
  toolInvocation: ToolInvocation;
  toolCallId: string;
  needsConfirmation: boolean;
  addToolResult: (args: { toolCallId: string; result: string }) => void;
}

export function ToolInvocationCard({
  toolInvocation,
  toolCallId,
  needsConfirmation,
  addToolResult
}: ToolInvocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Card
      className={`p-4 my-3 w-full max-w-[500px] rounded-md bg-neutral-100 dark:bg-neutral-900 ${
        needsConfirmation ? "" : "border-[#F48120]/30"
      } overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 cursor-pointer"
      >
        <div
          className={`${needsConfirmation ? "bg-[#F48120]/10" : "bg-[#F48120]/5"} p-1.5 rounded-full flex-shrink-0`}
        >
          <Robot size={16} className="text-[#F48120]" />
        </div>
        <h4 className="font-medium flex items-center gap-2 flex-1 text-left">
          {toolInvocation.toolName}
          {!needsConfirmation && toolInvocation.state === "result" && (
            <span className="text-xs text-[#F48120]/70">✓ Completed</span>
          )}
        </h4>
        <CaretDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`transition-all duration-200 ${isExpanded ? "max-h-[200px] opacity-100 mt-3" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div
          className="overflow-y-auto"
          style={{ maxHeight: isExpanded ? "180px" : "0px" }}
        >
          <div className="mb-3">
            <h5 className="text-xs font-medium mb-1 text-muted-foreground">
              Arguments:
            </h5>
            <pre className="bg-background/80 p-2 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words max-w-[450px]">
              {JSON.stringify(toolInvocation.args, null, 2)}
            </pre>
          </div>

          {needsConfirmation && toolInvocation.state === "call" && (
            <div className="flex gap-2 justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  addToolResult({
                    toolCallId,
                    result: APPROVAL.NO
                  })
                }
              >
                Reject
              </Button>
              <Tooltip content={"Accept action"}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    addToolResult({
                      toolCallId,
                      result: APPROVAL.YES
                    })
                  }
                >
                  Approve
                </Button>
              </Tooltip>
            </div>
          )}

          {!needsConfirmation && toolInvocation.state === "result" && (
            <div className="mt-3 border-t border-[#F48120]/10 pt-3">
              <h5 className="text-xs font-medium mb-1 text-muted-foreground">
                Result:
              </h5>
              {(() => {
                const r: any = toolInvocation.result as any;
                const tool = toolInvocation.toolName;
                const arrayResult: any[] | null = Array.isArray(r)
                  ? r
                  : Array.isArray(r?.content)
                    ? (r.content as any[])
                    : null;

                function fmt(dt?: string) {
                  try {
                    return dt ? new Date(dt).toLocaleString() : "";
                  } catch {
                    return dt ?? "";
                  }
                }

                // Render searchFlights results
                if (tool === "searchFlights" && arrayResult) {
                  return (
                    <div className="space-y-2">
                      {arrayResult.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No flights found for your criteria.
                        </p>
                      )}
                      {arrayResult.slice(0, 10).map((f: any) => (
                        <div
                          key={f.id}
                          className="border border-neutral-200 dark:border-neutral-800 rounded-md p-2"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">
                              {f.carrier} {f.flightNumber}
                            </span>
                            {typeof f.priceUSD !== "undefined" && (
                              <span className="text-[#F48120] font-semibold">{`$${f.priceUSD}`}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <div>
                              Depart: {fmt(f.departTime)} • Arrive:{" "}
                              {fmt(f.arriveTime)}
                            </div>
                            <div>
                              Duration: {f.durationMinutes} min • Stops:{" "}
                              {f.stops} • Cabin: {f.cabin}
                            </div>
                            <div>
                              ID:{" "}
                              <code className="px-1 py-0.5 bg-neutral-200/50 dark:bg-neutral-800/50 rounded">
                                {f.id}
                              </code>
                            </div>
                          </div>
                          <div className="mt-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const prompt = `Book flight ${f.id} for Jane Doe`;
                                navigator.clipboard?.writeText(prompt);
                              }}
                            >
                              Copy booking prompt
                            </Button>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">
                        Use the copied prompt (or type your own) to proceed with
                        booking. You’ll be asked to approve.
                      </p>
                    </div>
                  );
                }

                // Render searchHotels results
                if (tool === "searchHotels" && arrayResult) {
                  return (
                    <div className="space-y-2">
                      {arrayResult.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No hotels found for your criteria.
                        </p>
                      )}
                      {arrayResult.slice(0, 10).map((h: any) => (
                        <div
                          key={h.id}
                          className="border border-neutral-200 dark:border-neutral-800 rounded-md p-2"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">
                              {h.name} {h.stars ? `(${h.stars}★)` : ""}
                            </span>
                            {typeof h.totalUSD !== "undefined" && (
                              <span className="text-[#F48120] font-semibold">{`$${h.totalUSD}`}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <div>Location: {h.location}</div>
                            <div>
                              Check-in: {fmt(h.checkIn)} • Check-out:{" "}
                              {fmt(h.checkOut)}
                            </div>
                            <div>
                              Per night: {`$${h.pricePerNightUSD}`} • ID:{" "}
                              <code className="px-1 py-0.5 bg-neutral-200/50 dark:bg-neutral-800/50 rounded">
                                {h.id}
                              </code>
                            </div>
                          </div>
                          <div className="mt-2 flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const prompt = `Book hotel ${h.id} for Jane Doe (1 room)`;
                                navigator.clipboard?.writeText(prompt);
                              }}
                            >
                              Copy booking prompt
                            </Button>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">
                        Use the copied prompt (or type your own) to proceed with
                        booking. You’ll be asked to approve.
                      </p>
                    </div>
                  );
                }

                // Fallback to prior rendering
                return (
                  <pre className="bg-background/80 p-2 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words max-w-[450px]">
                    {(() => {
                      const result = toolInvocation.result;
                      if (
                        typeof result === "object" &&
                        (result as any)?.content
                      ) {
                        return (result as any).content
                          .map((item: { type: string; text: string }) => {
                            if (
                              item.type === "text" &&
                              item.text.startsWith("\n~ Page URL:")
                            ) {
                              const lines = item.text
                                .split("\n")
                                .filter(Boolean);
                              return lines
                                .map(
                                  (line: string) =>
                                    `- ${line.replace("\n~ ", "")}`
                                )
                                .join("\n");
                            }
                            return item.text;
                          })
                          .join("\n");
                      }
                      return JSON.stringify(result, null, 2);
                    })()}
                  </pre>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
