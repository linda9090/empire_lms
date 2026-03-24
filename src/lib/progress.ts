export function calculateProgressPercentage(
  completedLessons: number,
  totalLessons: number
): number {
  if (totalLessons <= 0) {
    return 0;
  }

  const rawValue = Math.round((completedLessons / totalLessons) * 100);
  return Math.min(Math.max(rawValue, 0), 100);
}
