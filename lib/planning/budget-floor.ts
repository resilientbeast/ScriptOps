import type { InitialProductionPlan } from "@/lib/planning/schemas";

/**
 * A conservative planning floor, not a vendor quote. Rates are visible in code
 * so producers can replace this pilot card with negotiated regional rates.
 */
export const NM_PILOT_RATE_CARD = {
  crewHoursPerDay: 10,
  crewCount: 10,
  crewHourlyRate: 35,
  castDayRate: 500,
  equipmentPerDay: 1_200,
  locationsAndPermitsPerDay: 750,
  transportPerDay: 500,
  cateringPerDay: 600,
  insuranceAndAdminPerProject: 800,
  postProductionPerProject: 2_000,
  nightPremiumPerDay: 500,
  weatherProtectionPerDay: 1_000,
  contingencyRate: 0.15,
} as const;

export function minimumProductionBudget(input: Pick<InitialProductionPlan, "schedule" | "casting" | "scenes">, requestText: string) {
  const card = NM_PILOT_RATE_CARD;
  const shootDays = input.schedule.shootDays;
  const hasNight = input.schedule.days.some(day => day.dayNight === "night" || day.dayNight === "mixed") || input.scenes.some(scene => scene.timeOfDay === "night");
  const hasWeatherWork = /\b(rain|weather|wet|snow|wind)\b/i.test(requestText);
  const lines = {
    crew: shootDays * card.crewCount * card.crewHoursPerDay * card.crewHourlyRate,
    cast: shootDays * input.casting.length * card.castDayRate,
    equipment: shootDays * card.equipmentPerDay,
    locations: shootDays * card.locationsAndPermitsPerDay,
    transport: shootDays * card.transportPerDay,
    catering: shootDays * card.cateringPerDay,
    insurance: card.insuranceAndAdminPerProject,
    postProduction: card.postProductionPerProject,
    night: hasNight ? shootDays * card.nightPremiumPerDay : 0,
    weather: hasWeatherWork ? shootDays * card.weatherProtectionPerDay : 0,
  };
  const subtotal = Object.values(lines).reduce((total, value) => total + value, 0);
  const contingency = Math.ceil(subtotal * card.contingencyRate);
  const low = subtotal + contingency;
  return { low, high: Math.ceil(low * 1.25), shootDays, hasNight, hasWeatherWork, lines: { ...lines, contingency } };
}
