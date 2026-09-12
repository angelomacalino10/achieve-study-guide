import type { Context, Config } from "@netlify/functions";
import { getChapterText } from "./_lib/content.mts";

const SYSTEM_PROMPT = `You are Achieve's study guide generator. You write clear, encouraging, exam-focused study material for college and test-prep students. Always respond with strict JSON only, matching exactly this shape, and nothing else (no markdown fences, no commentary):

{
  "explanation": "2-4 sentence plain-language explanation of the topic",
  "keyTerms": [{"term": "...", "def": "..."}],
  "examples": ["...", "..."],
  "steps": ["...", "..."],
  "remember": ["...", "..."]
}

Rules:
- keyTerms: 4-8 of the most important terms with short definitions.
- examples: 2-4 concrete examples or applications.
- steps: 3-6 items breaking the topic into a step-by-step or staged breakdown. This works even for non-procedural subjects (history, sociology, literature) — use stages, phases, or a logical sequence instead of literal steps.
- remember: 3-5 short, exam-focused takeaways.
- Ground everything in the SOURCE MATERIAL provided when given. Only lean on general knowledge to fill gaps the source doesn't cover.`;

function extractJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return s.slice(start, end + 1);
  }
  return s;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { course, topic, needs } = body || {};
  if (!course || !topic) {
    return new Response(
      JSON.stringify({ error: "course and topic are required" }),
      { status: 400 }
    );
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on this site" }),
      { status: 500 }
    );
  }

  const { matchedTopic, text } = getChapterText(course, topic);
  const sourceExcerpt = text ? text.slice(0, 15000) : null;

  const userPrompt = [
    `Course: ${course}`,
    `Topic requested: ${topic}`,
    matchedTopic
      ? `Matched source chapter: ${matchedTopic}`
      : `No exact source chapter matched — use general knowledge for this topic.`,
    Array.isArray(needs) && needs.length
      ? `The student specifically wants help with: ${needs.join("; ")}.`
      : `The student wants a complete review.`,
    sourceExcerpt ? `\nSOURCE MATERIAL:\n${sourceExcerpt}` : "",
  ].join("\n");

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: "Claude API error", detail: errText }),
        { status: 502 }
      );
    }

    const data = await resp.json();
    const raw = (data.content || [])
      .map((b: any) => b.text || "")
      .join("")
      .trim();
    const cleaned = extractJson(raw);

    let guide;
    try {
      guide = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Could not parse AI response", raw: raw.slice(0, 500) }),
        { status: 502 }
      );
    }

    return new Response(JSON.stringify({ matchedTopic, guide }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Request failed", detail: String(err) }),
      { status: 500 }
    );
  }
};

export const config: Config = {
  path: "/api/study-guide",
};
