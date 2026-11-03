// src/quizzes/quiz-results.ts
// The scores of the module quizzes (QuizAttempt): the share of right answers
// and the best attempt of a student.

export type AttemptScore = { correct: number; total: number; createdAt: Date };

// The best attempt, with its share of right answers (a whole percentage)
export type BestScore = {
  correct: number;
  total: number;
  percentage: number;
  createdAt: Date;
};

export function percentOf(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

// The highest share of right answers; of equal ones, the most recent. null
// when there is no attempt.
export function bestOf(attempts: AttemptScore[]): BestScore | null {
  let best: AttemptScore | null = null;
  for (const attempt of attempts) {
    if (best === null) {
      best = attempt;
      continue;
    }
    // a/b against c/d without rounding: a*d against c*b
    const mine = attempt.correct * best.total;
    const theirs = best.correct * attempt.total;
    if (
      mine > theirs ||
      (mine === theirs && attempt.createdAt > best.createdAt)
    ) {
      best = attempt;
    }
  }
  if (best === null) {
    return null;
  }
  return {
    correct: best.correct,
    total: best.total,
    percentage: percentOf(best.correct, best.total),
    createdAt: best.createdAt,
  };
}
