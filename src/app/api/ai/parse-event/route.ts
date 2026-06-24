import { NextResponse } from "next/server";

const ARK_VISION_MODEL = process.env.ARK_MODEL?.trim() || "doubao-seed-2-1-pro-260628";
const ARK_TEXT_MODEL = process.env.ARK_TEXT_MODEL?.trim() || ARK_VISION_MODEL;
const ARK_RESPONSES_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const AI_TIMEOUT_MS = 9_000;
const MAX_IMAGE_DATA_URL_LENGTH = 3_500_000;
const CATEGORY_OPTIONS = ["Life", "Study", "Date", "Work", "Health", "Other"];

type ParseRequest = {
  text?: unknown;
  now?: unknown;
  timezone?: unknown;
  currentDate?: unknown;
  partnerName?: unknown;
  imageDataUrl?: unknown;
};

type ArkResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      output_text?: string;
    }>;
  }>;
};

export async function POST(request: Request) {
  const apiKey = process.env.ARK_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Ark API key is not configured." }, { status: 500 });
  }

  let payload: ParseRequest;
  try {
    payload = (await request.json()) as ParseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const imageDataUrl = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";
  const hasImage = isSupportedImageDataUrl(imageDataUrl);
  if (!text && !hasImage) {
    return NextResponse.json({ error: "Missing event input." }, { status: 400 });
  }
  if (imageDataUrl && !hasImage) {
    return NextResponse.json({ error: "Unsupported or oversized image." }, { status: 400 });
  }

  const now = typeof payload.now === "string" ? payload.now : new Date().toISOString();
  const timezone = typeof payload.timezone === "string" ? payload.timezone : "Asia/Hong_Kong";
  const currentDate = typeof payload.currentDate === "string" ? payload.currentDate : "";
  const partnerName = typeof payload.partnerName === "string" ? payload.partnerName : "";
  const fallbackTitle = text || "Image event";
  const prompt = buildPrompt({ text, now, timezone, currentDate, partnerName, hasImage });
  const model = hasImage ? ARK_VISION_MODEL : ARK_TEXT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(ARK_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              ...(hasImage ? [{ type: "input_image", image_url: imageDataUrl }] : []),
              { type: "input_text", text: prompt }
            ]
          }
        ],
        temperature: 0.1,
        max_output_tokens: 1024,
        reasoning: { effort: "minimal" }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error("Ark API request failed", {
        status: response.status,
        model
      });
      return NextResponse.json(
        { error: "AI parse request failed.", upstreamStatus: response.status },
        { status: 502 }
      );
    }

    const ark = (await response.json()) as ArkResponse;
    const parsed = parseModelJson(extractArkText(ark));

    if (!parsed) {
      return NextResponse.json(getFallbackResult(fallbackTitle, false));
    }

    return NextResponse.json(normalizeParsedResult(parsed, fallbackTitle, hasImage ? null : text));
  } catch (error) {
    if (isAbortError(error)) {
      return NextResponse.json(getFallbackResult(fallbackTitle, false));
    }
    return NextResponse.json({ error: "AI parse request failed." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt({
  text,
  now,
  timezone,
  currentDate,
  partnerName,
  hasImage
}: {
  text: string;
  now: string;
  timezone: string;
  currentDate: string;
  partnerName: string;
  hasImage: boolean;
}) {
  return [
    hasImage
      ? "Extract one calendar event from the supplied image and optional user text into JSON only."
      : "Parse one natural-language calendar event into JSON only.",
    "Do not include markdown, comments, or explanatory text.",
    `User local datetime ISO: ${now}`,
    `User timezone: ${timezone}`,
    `Currently visible calendar date: ${currentDate}`,
    partnerName ? `Partner display name: ${partnerName}` : "Partner display name: none",
    `Allowed categories: ${CATEGORY_OPTIONS.join(", ")}`,
    "Return exactly these keys:",
    '{ "title": string|null, "date": "YYYY-MM-DD"|null, "start_time": "HH:mm"|null, "end_time": "HH:mm"|null, "category": string|null, "include_partner": boolean, "is_all_day": boolean, "source_text": string|null }',
    "Rules:",
    "- If the event title is unclear, use the original input as title.",
    "- Resolve relative dates using the supplied local datetime.",
    "- If only a start time is present, omit end_time; the app will default to 1 hour.",
    "- Use category Life unless the text clearly indicates Study, Date, Work, Health, or Other.",
    "- include_partner must be true only when the input explicitly mentions the partner display name.",
    "- If there is a date but no specific time, set is_all_day true.",
    "- If no usable date or time is present, set date/start_time/end_time null and keep title.",
    "- source_text must contain the relevant text read from the image, or the original text input.",
    text ? `Input: ${text}` : "Input: image only"
  ].join("\n");
}

function extractArkText(response: ArkResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? item.output_text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function parseModelJson(rawText: string) {
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

function normalizeParsedResult(parsed: Record<string, unknown>, fallbackTitle: string, originalText: string | null) {
  const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : originalText;
  const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const startTime = typeof parsed.start_time === "string" && isClockTime(parsed.start_time) ? parsed.start_time : null;
  const parsedEndTime = typeof parsed.end_time === "string" && isClockTime(parsed.end_time) ? parsed.end_time : null;
  const sourceText = originalText ?? (typeof parsed.source_text === "string" ? parsed.source_text.trim() : "");
  const endTime = startTime && !hasExplicitTimeRange(sourceText) ? addOneHour(startTime) : parsedEndTime;
  const category = typeof parsed.category === "string" && CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : "Life";

  return {
    parsed: true,
    title: title || fallbackTitle,
    date,
    start_time: startTime,
    end_time: endTime,
    category,
    include_partner: parsed.include_partner === true,
    is_all_day: parsed.is_all_day === true,
    source_text: sourceText || null
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
    is_all_day: false,
    source_text: null
  };
}

function hasExplicitTimeRange(text: string) {
  return /\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|\u70B9|\u65F6)?\s*(?:-|\u2013|\u2014|~|\uFF5E|\bto\b|\buntil\b|\btill\b|\u5230|\u81F3)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|\u70B9|\u65F6)?/i.test(text);
}

function addOneHour(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const nextHours = (hours + 1) % 24;
  return `${String(nextHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isSupportedImageDataUrl(value: string) {
  return value.length <= MAX_IMAGE_DATA_URL_LENGTH && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isClockTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
