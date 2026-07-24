export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { GoogleGenAI, type Content, type FunctionCall, type Part } from "@google/genai";
import { format } from "date-fns";
import { coachTools, COACH_SYSTEM_PROMPT } from "@/lib/coach";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MODEL = "gemini-flash-latest";
const MAX_TOOL_ROUNDS = 8;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    const raw = Array.isArray(body?.messages) ? body.messages : [];
    messages = raw
      .filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof m === "object" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
          typeof (m as ChatMessage).content === "string" &&
          (m as ChatMessage).content.length > 0
      )
      .slice(-30)
      .map((m: ChatMessage) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Last message must be from the user." }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const config = {
    systemInstruction: `${COACH_SYSTEM_PROMPT}\n\nToday's date: ${format(new Date(), "yyyy-MM-dd (EEEE)")}.`,
    tools: [
      {
        functionDeclarations: coachTools.map((t) => ({
          name: t.name,
          description: t.description,
          ...(t.parameters ? { parametersJsonSchema: t.parameters } : {}),
        })),
      },
    ],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: { t: string; d?: string }) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await ai.models.generateContentStream({
            model: MODEL,
            contents,
            config,
          });

          // Collect the model turn's parts verbatim — newer Gemini models attach
          // thought signatures to parts, and those must be echoed back unchanged
          // for function calling to work.
          const modelParts: Part[] = [];
          for await (const chunk of response) {
            for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
              if (part.thought) {
                if (part.thoughtSignature) modelParts.push({ ...part });
                continue;
              }
              if (part.text) {
                send({ t: "text", d: part.text });
                const last = modelParts[modelParts.length - 1];
                if (part.thoughtSignature || !last || last.functionCall || last.thought || typeof last.text !== "string") {
                  modelParts.push({ ...part });
                } else {
                  last.text += part.text;
                }
              } else if (part.functionCall) {
                modelParts.push({ ...part });
              }
            }
          }

          const calls: FunctionCall[] = modelParts
            .filter((p) => p.functionCall)
            .map((p) => p.functionCall!);
          if (calls.length === 0) break;

          contents.push({ role: "model", parts: modelParts });

          // ...then execute the calls and feed results back.
          const resultParts: Part[] = [];
          for (const call of calls) {
            const name = call.name ?? "";
            send({ t: "tool", d: name });
            const tool = coachTools.find((t) => t.name === name);
            let result: string;
            try {
              result = tool
                ? await tool.run((call.args ?? {}) as Record<string, unknown>)
                : `Unknown tool: ${name}`;
            } catch (err) {
              result = `Error running ${name}: ${err instanceof Error ? err.message : String(err)}`;
            }
            resultParts.push({
              functionResponse: { ...(call.id ? { id: call.id } : {}), name, response: { result } },
            });
          }
          contents.push({ role: "user", parts: resultParts });
        }
        send({ t: "done" });
      } catch (err) {
        send({ t: "error", d: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
