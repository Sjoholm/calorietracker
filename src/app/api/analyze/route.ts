import { NextResponse } from "next/server";
import OpenAI from "openai";

const systemPrompt = `
You are a nutrition analyst. Given an image of food and/or a short description, return a concise JSON summary with estimated macros. Use common sense portion sizing. If unsure, note low confidence but still estimate. Prefer imperial/metric neutral units (cup, g, oz, slice, piece).

Response JSON schema:
{
  "mealTitle": "string",
  "items": [
    {
      "name": "string",
      "quantity": "string",
      "kcal": number,
      "protein": number,
      "carbs": number,
      "fat": number
    }
  ],
  "notes": "short string",
  "confidence": number // 0-1
}

Always return valid JSON, nothing else.
`;

type AnalyzePayload = {
  message?: string;
  imageBase64?: string | null;
  mealLabel?: string;
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let payload: AnalyzePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { message, imageBase64, mealLabel } = payload;

  if (!message && !imageBase64) {
    return NextResponse.json(
      { error: "Provide an image or a description to analyze." },
      { status: 400 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userContent: OpenAI.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `Meal label: ${mealLabel ?? "Meal"}\nUser description: ${
          message || "None"
        }`,
      },
    ];

    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageBase64 },
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.2,
    });

    const raw = completion.choices[0].message.content;
    if (!raw) throw new Error("No content returned from OpenAI.");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Failed to parse AI response as JSON.");
    }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const total = items.reduce(
      (
        acc: { kcal: number; protein: number; carbs: number; fat: number },
        item: { kcal?: number; protein?: number; carbs?: number; fat?: number },
      ) => ({
        kcal: acc.kcal + (Number(item.kcal) || 0),
        protein: acc.protein + (Number(item.protein) || 0),
        carbs: acc.carbs + (Number(item.carbs) || 0),
        fat: acc.fat + (Number(item.fat) || 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );

    return NextResponse.json({
      mealTitle: parsed.mealTitle ?? mealLabel ?? "Meal",
      items,
      notes: parsed.notes,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      total,
      raw,
    });
  } catch (error) {
    console.error("AI analyze error", error);
    return NextResponse.json(
      { error: "Unable to analyze meal right now." },
      { status: 500 },
    );
  }
}

