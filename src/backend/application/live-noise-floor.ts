// Falls fast when the room gets quieter, rises slowly so the onset of a word barely moves it.
const FALL = 0.2;
const RISE = 0.02;

/** The room level after one more frame outside any utterance (RMS, 0 to 1). */
export function nextNoiseFloor(floor: number, energy: number): number {
  return floor + (energy - floor) * (energy < floor ? FALL : RISE);
}

/** A frame is speech above `factor` times the room level, never below `minimum`. */
export function speechThreshold(floor: number, minimum: number, factor: number): number {
  return Math.max(minimum, factor * floor);
}
