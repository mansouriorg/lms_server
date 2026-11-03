// src/common/reorder.ts
// Moving one item of an ordered list one place up or down: the modules of a
// course (CourseModulesService.move) or the lessons of a module
// (LessonsService.move).

export type Direction = 'up' | 'down';

// The ids in their new order, or null when there is nothing to move: the id
// is not in the list, or it is already first (up) or last (down).
export function moveInOrder(
  ids: string[],
  id: string,
  direction: Direction,
): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const moved = [...ids];
  moved[from] = ids[to];
  moved[to] = id;
  return moved;
}
