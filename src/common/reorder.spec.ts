import { moveInOrder } from './reorder';

describe('moveInOrder (moving a module or a lesson)', () => {
  const ids = ['a', 'b', 'c'];

  it('moves one place up or down', () => {
    expect(moveInOrder(ids, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(ids, 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(ids, 'a', 'down')).toEqual(['b', 'a', 'c']);
    // The list itself is not changed
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('nothing to move: first up, last down, or an unknown id', () => {
    expect(moveInOrder(ids, 'a', 'up')).toBeNull();
    expect(moveInOrder(ids, 'c', 'down')).toBeNull();
    expect(moveInOrder(ids, 'x', 'up')).toBeNull();
    expect(moveInOrder([], 'a', 'down')).toBeNull();
  });
});
