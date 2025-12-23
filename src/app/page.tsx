"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

type MacroBreakdown = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealItem = {
  name: string;
  quantity: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealEntry = {
  id: string;
  title: string;
  time: string;
  macros: MacroBreakdown;
  items: MealItem[];
  image?: string | null;
  notes?: string;
  confidence?: number;
};

type AnalyzeResponse = {
  mealTitle: string;
  items: MealItem[];
  notes?: string;
  confidence?: number;
  total?: MacroBreakdown;
};

const initialAssistantMessage =
  "Upload a photo or tell me what you ate. I will estimate calories and macros with OpenAI and add it to your day.";

type Theme = "light" | "dark";

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().split("T")[0],
  );
  const [historyByDate, setHistoryByDate] = useState<Record<string, MealEntry[]>>({});
  const [chat, setChat] = useState<{ role: "assistant" | "user"; text: string }[]>(
    [{ role: "assistant", text: initialAssistantMessage }],
  );
  const [message, setMessage] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  const todaysEntries = useMemo(
    () => historyByDate[selectedDate] ?? [],
    [historyByDate, selectedDate],
  );

  const totals = useMemo(() => {
    return todaysEntries.reduce<MacroBreakdown>(
      (acc, entry) => ({
        kcal: acc.kcal + entry.macros.kcal,
        protein: acc.protein + entry.macros.protein,
        carbs: acc.carbs + entry.macros.carbs,
        fat: acc.fat + entry.macros.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [todaysEntries]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!message && !imagePreview) {
      setError("Add a photo or describe your meal first.");
      return;
    }
    setError(null);
    setIsSending(true);
    setChat((prev) => [...prev, { role: "user", text: message || "(photo only)" }]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          imageBase64: imagePreview,
          mealLabel: guessMealLabel(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "AI analysis failed");
      }

      const data: AnalyzeResponse = await res.json();
      const macros = data.total ?? computeTotals(data.items ?? []);
      const entry: MealEntry = {
        id: crypto.randomUUID(),
        title: data.mealTitle || guessMealLabel(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        macros,
        items: data.items ?? [],
        image: imagePreview,
        notes: data.notes,
        confidence: data.confidence,
      };

      setHistoryByDate((prev) => ({
        ...prev,
        [selectedDate]: [...(prev[selectedDate] ?? []), entry],
      }));

      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: renderAssistantSummary(entry),
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong with OpenAI.";
      setError(message);
      setChat((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      setIsSending(false);
      setMessage("");
      setImagePreview(null);
    }
  };

  const guessMealLabel = () => {
    const hour = new Date().getHours();
    if (hour < 11) return "Breakfast";
    if (hour < 15) return "Lunch";
    if (hour < 18) return "Snack";
    return "Dinner";
  };

  const computeTotals = (items: MealItem[]): MacroBreakdown => {
    return items.reduce(
      (acc, item) => ({
        kcal: acc.kcal + (item.kcal || 0),
        protein: acc.protein + (item.protein || 0),
        carbs: acc.carbs + (item.carbs || 0),
        fat: acc.fat + (item.fat || 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
  };

  const renderAssistantSummary = (entry: MealEntry) => {
    const macroLine = `${Math.round(entry.macros.kcal)} kcal — P${Math.round(entry.macros.protein)}g C${Math.round(entry.macros.carbs)}g F${Math.round(entry.macros.fat)}g`;
    const foods =
      entry.items.length > 0
        ? entry.items.map((i) => `${i.name} (${i.quantity})`).join(", ")
        : entry.title;
    const conf =
      typeof entry.confidence === "number"
        ? `Confidence: ${(entry.confidence * 100).toFixed(0)}%`
        : "Confidence: n/a";
    return `${entry.title}: ${foods}\n${macroLine}\n${conf}`;
  };

  useEffect(() => {
    const stored = window.localStorage.getItem("theme") as Theme | null;
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const surface = theme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const muted = theme === "dark" ? "text-slate-300" : "text-slate-500";
  const card = theme === "dark" ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200";

  return (
    <div className={theme === "dark" ? "min-h-screen bg-slate-950 text-slate-100" : "min-h-screen bg-slate-50 text-slate-900"}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        <aside className={`rounded-3xl border ${surface} p-4 shadow-sm`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Today</h2>
              <p className={`text-sm ${muted}`}>Track meals by day</p>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-inner dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="mb-4 rounded-2xl bg-blue-600 px-4 py-3 text-white shadow dark:bg-blue-500">
            <p className="text-sm uppercase tracking-wide text-blue-100">Totals</p>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-3xl font-semibold">{Math.round(totals.kcal)} kcal</div>
              <div className="text-right text-sm text-blue-50">
                <p>P {Math.round(totals.protein)}g</p>
                <p>C {Math.round(totals.carbs)}g</p>
                <p>F {Math.round(totals.fat)}g</p>
              </div>
            </div>
          </div>

          <div className="flex h-[calc(100vh-280px)] flex-col gap-3 overflow-y-auto pr-2">
            {todaysEntries.length === 0 ? (
              <p className={`text-sm ${muted}`}>
                No meals logged yet. Add one from the center panel.
              </p>
            ) : (
              todaysEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex gap-3 rounded-2xl border ${card} p-3 shadow-inner`}
                >
                  {entry.image ? (
                  <Image
                    src={entry.image}
                    alt={entry.title}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-200 text-sm text-slate-600">
                      {entry.title[0]}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-center justify-between">
                        <p className="font-semibold">{entry.title}</p>
                        <span className={`text-xs ${muted}`}>{entry.time}</span>
                    </div>
                      <p className={`text-xs uppercase ${muted}`}>
                      {Math.round(entry.macros.kcal)} kcal · P{Math.round(entry.macros.protein)}g
                      · C{Math.round(entry.macros.carbs)}g · F{Math.round(entry.macros.fat)}g
                    </p>
                    {entry.notes && (
                        <p className="mt-1 max-h-12 overflow-hidden text-ellipsis text-xs text-slate-300 dark:text-slate-200">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className={`flex flex-col gap-4 rounded-3xl border ${surface} p-6 shadow-sm`}>
          <header className="flex flex-col gap-1 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Calorie tracker</h1>
                <p className={`text-sm ${muted}`}>
                  Center: upload a meal photo and chat with AI. Left: day history with macros.
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
              </button>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)]">
            <div className={`rounded-2xl border border-dashed ${theme === "dark" ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-50"} p-4`}>
              <label className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border ${theme === "dark" ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt="Selected meal"
                    width={400}
                    height={400}
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <>
                    <span className="text-lg font-semibold">Upload meal photo</span>
                    <span className="text-sm text-slate-500">
                      Drop an image or click to browse
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3">
                <div className={`flex flex-col gap-2 rounded-2xl border ${theme === "dark" ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"} p-4`}>
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Chat</p>
                    <span className={`text-xs ${muted}`}>Powered by OpenAI</span>
                </div>
                  <div className={`flex flex-col gap-2 overflow-y-auto rounded-xl p-3 text-sm max-h-64 ${theme === "dark" ? "bg-slate-800 text-slate-100" : "bg-white text-slate-700"}`}>
                  {chat.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg px-3 py-2 ${
                        msg.role === "assistant"
                          ? theme === "dark"
                            ? "bg-slate-700 text-slate-100"
                            : "bg-slate-100 text-slate-800"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      {msg.text}
                    </div>
                  ))}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Describe what you ate (portion, sides, drinks)..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  onClick={handleSubmit}
                  disabled={isSending}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isSending ? "Analyzing with OpenAI..." : "Send to AI"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
