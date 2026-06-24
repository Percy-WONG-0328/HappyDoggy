import { NextResponse } from "next/server";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const CATEGORY_OPTIONS = ["Life", "Study", "Date", "Work", "Health", "Other"];

type ParseRequest = {
  text?: unknown;
  now?: unknown;
  timezone?: unknown;
  currentDate?: unknown;
  partnerName?: unknown;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API key is not configured." }, { status: 500 });
  }

  let payload: ParseRequest;
  try {
    payload = (await request.json()) as ParseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Missing event text." }, { status: 400 });
  }

  const now = typeof payload.now === "string" ? payload.now : new Date().toISOString();
  const timezone = typeof payload.timezone === "string" ? payload.timezone : "Asia/Hong_Kong";
  const currentDate = typeof payload.currentDate === "string" ? payload.currentDate : "";
  const partnerName = typeof payload.partnerName === "string" ? payload.partnerName : "";
  const prompt = buildPrompt({ text, now, timezone, currentDate, partnerName });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      console.error("Gemini API request failed", {
        status: response.status,
        model: GEMINI_MODEL
      });
      return NextResponse.json(
        { error: "AI parse request failed.", upstreamStatus: response.status },
        { status: 502 }
      );
    }

    const gemini = (await response.json()) as GeminiResponse;
    const rawText = gemini.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    const parsed = parseGeminiJson(rawText);

    if (!parsed) {
      return NextResponse.json(getFallbackResult(text, false));
    }

    return NextResponse.json(normalizeParsedResult(parsed, text));
  } catch {
    return NextResponse.json({ error: "AI parse request failed." }, { status: 502 });
  }
}

function buildPrompt({
  text,
  now,
  timezone,
  currentDate,
  partnerName
}: {
  text: string;
  now: string;
  timezone: string;
  currentDate: string;
  partnerName: string;
}) {
  return [
    "Parse one natural-language calendar event into JSON only.",
    "Do not include markdown, comments, or explanatory text.",
    `User local datetime ISO: ${now}`,
    `User timezone: ${timezone}`,
    `Currently visible calendar date: ${currentDate}`,
    partnerName ? `Partner display name: ${partnerName}` : "Partner display name: none",
    `Allowed categories: ${CATEGORY_OPTIONS.join(", ")}`,
    "Return exactly these keys:",
    '{ "title": string|null, "date": "YYYY-MM-DD"|null, "start_time": "HH:mm"|null, "end_time": "HH:mm"|null, "category": string|null, "include_partner": boolean, "is_all_day": boolean }',
    "Rules:",
    "- If the event title is unclear, use the original input as title.",
    "- Resolve relative dates using the supplied local datetime.",
    "- If only a start time is present, omit end_time; the app will default to 1 hour.",
    "- Use category Life unless the text clearly indicates Study, Date, Work, Health, or Other.",
    "- include_partner must be true only when the input explicitly mentions the partner display name.",
    "- If there is a date but no specific time, set is_all_day true.",
    "- If no usable date or time is present, set date/start_time/end_time null and keep title.",
    `Input: ${text}`
  ].join("\n");
}

function parseGeminiJson(rawText: string) {
  if (!rawText) return null;
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeParsedResult(parsed: Record<string, unknown>, originalText: string) {
  const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : originalText;
  const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const startTime = typeof parsed.start_time === "string" && isClockTime(parsed.start_time) ? parsed.start_time : null;
  const endTime = typeof parsed.end_time === "string" && isClockTime(parsed.end_time) ? parsed.end_time : null;
  const category = typeof parsed.category === "string" && CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : "Life";

  return {
    parsed: true,
    title,
    date,
    start_time: startTime,
    end_time: endTime,
    category,
    include_partner: parsed.include_partner === true,
    is_all_day: parsed.is_all_day === true
  };
}

function getFallbackResult(originalText: string, parsed: boolean) {
  return {
    parsed,
    title: originalText,
    date: null,
    start_time: null,
    end_time: null,
    category: "Life",
    include_partner: false,
    is_all_day: false
  };
}

function isClockTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
