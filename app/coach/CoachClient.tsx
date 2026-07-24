"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
};

const STORAGE_KEY = "liftlog-coach-chat";

const TOOL_LABELS: Record<string, string> = {
  get_training_overview: "Reviewing recent training",
  get_current_program: "Reading your program",
  list_exercises: "Looking up exercises",
  get_exercise_history: "Checking exercise history",
  get_workout_detail: "Reading workout log",
  get_volume_by_bodypart: "Analyzing weekly volume",
};

const SUGGESTIONS = [
  "How is my bench press progressing?",
  "Am I doing enough volume for each muscle group?",
  "What should I focus on this week?",
];

export default function CoachClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // ignore corrupt storage
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage full — fine, chat just won't persist
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    setBusy(true);

    const history = [...messages, { role: "user" as const, content: trimmed }];
    // Placeholder assistant message that we stream into
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const apply = (fn: (last: Message) => Message) =>
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = fn(next[next.length - 1]);
          return next;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { t: string; d?: string };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.t === "text" && event.d) {
            apply((m) => ({ ...m, content: m.content + event.d }));
          } else if (event.t === "tool" && event.d) {
            apply((m) => ({ ...m, tools: [...(m.tools ?? []), event.d!] }));
          } else if (event.t === "error") {
            throw new Error(event.d ?? "Something went wrong.");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Drop the empty placeholder if nothing streamed in
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-44 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            SwoleGuy<span className="text-purple-400">AI</span>
          </h1>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear chat
            </button>
          )}
        </div>

        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-2">
              <p className="text-sm text-gray-300">
                Yo. I read your actual workout log and I know the research. Ask me
                anything about your training, brother.
              </p>
            </div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-purple-300 hover:border-[#444] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="bg-purple-600/20 border border-purple-600/30 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div className="space-y-2 max-w-[95%]">
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((t, j) => (
                      <span
                        key={j}
                        className="text-[11px] text-gray-500 bg-[#111] border border-[#222] rounded-full px-2.5 py-0.5"
                      >
                        {TOOL_LABELS[t] ?? t}
                      </span>
                    ))}
                  </div>
                )}
                {m.content ? (
                  <div className="bg-[#111] border border-[#222] rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                    <FormattedText text={m.content} />
                  </div>
                ) : (
                  busy &&
                  i === messages.length - 1 && (
                    <div className="bg-[#111] border border-[#222] rounded-2xl rounded-bl-md px-4 py-3">
                      <span className="inline-flex gap-1">
                        <Dot delay="0ms" />
                        <Dot delay="150ms" />
                        <Dot delay="300ms" />
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        {error && (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="fixed left-0 right-0 bottom-[68px] bg-[#0a0a0a] border-t border-[#222] px-4 py-3">
        <form
          className="max-w-lg mx-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask SwoleGuy..."
            className="flex-1 bg-[#111] border border-[#222] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500/50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="bg-purple-600 disabled:bg-[#222] disabled:text-gray-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {busy ? "..." : "Send"}
          </button>
        </form>
      </div>
    </>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
      style={{ animationDelay: delay }}
    />
  );
}

// Minimal formatting: **bold** spans within plain text
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="text-white font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
