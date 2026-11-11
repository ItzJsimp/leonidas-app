/** New chat greeting: one phrase set per time of day, plus two weekday moments. */

export type GreetingMoment = "morning" | "afternoon" | "evening" | "late" | "monday" | "friday";

/** Each entry: the greeting line (with `{name}`) and the question lead that ends in the project. */
const PHRASES: Record<GreetingMoment, readonly (readonly [string, string])[]> = {
  morning: [
    ["Good morning{name}", "What can we get done today in"],
    ["Morning{name}", "Where do we start in"],
    ["Fresh start{name}", "What comes first in"],
  ],
  afternoon: [
    ["Good afternoon{name}", "What can we get done in"],
    ["Afternoon{name}", "What should we finish in"],
    ["Back at it{name}", "What is next in"],
  ],
  evening: [
    ["Good evening{name}", "What should we wrap up in"],
    ["Evening{name}", "What is left to finish in"],
    ["Winding down{name}", "What is left for today in"],
  ],
  late: [
    ["Working late{name}?", "What is the one thing to finish in"],
    ["Still up{name}?", "What is the quick win in"],
    ["Late one{name}", "What needs to land before bed in"],
  ],
  monday: [["New week{name}", "What is first this week in"]],
  friday: [["Happy Friday{name}", "What can we ship before the weekend in"]],
};

/** Monday morning and Friday afternoon win; otherwise morning 5-12, afternoon 12-17, evening 17-22, late after that. */
export function greetingMoment(now: Date): GreetingMoment {
  const hour = now.getHours();
  const day = now.getDay();
  if (day === 1 && hour >= 5 && hour < 12) return "monday";
  if (day === 5 && hour >= 12 && hour < 18) return "friday";
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

/** The pick is stable for a whole day, so every new chat that day shows the same words. */
export function heroGreeting(
  now: Date,
  name: string,
): { readonly title: string; readonly lead: string } {
  const set = PHRASES[greetingMoment(now)];
  const [title, lead] = set[now.getDate() % set.length]!;
  const trimmed = name.trim();
  return { title: title.replace("{name}", trimmed ? `, ${trimmed}` : ""), lead };
}
