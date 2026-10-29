import test from 'node:test';
import assert from 'node:assert/strict';
import { getDuoPanes } from '../src/lib/duoLayout';

test('book pose puts artwork and commands on opposite sides of the actual division', () => {
  const panes = getDuoPanes({ width: 900, height: 700, regions: [{ kind: 'division', x: 430, y: 0, width: 32, height: 700 }] });
  assert.deepEqual(panes, {
    preview: { x: 0, y: 0, width: 430, height: 700 },
    commands: { x: 462, y: 0, width: 438, height: 700 },
  });
});

test('tabletop pose uses upper image and lower controls, without assuming equal halves', () => {
  const panes = getDuoPanes({ width: 700, height: 900, regions: [{ kind: 'division', x: 0, y: 400, width: 700, height: 24 }] });
  assert.equal(panes?.preview.height, 400);
  assert.equal(panes?.commands.y, 424);
  assert.equal(panes?.commands.height, 476);
});

test('camera occlusion is excluded from the controls pane independently of the opposite edge', () => {
  const panes = getDuoPanes({ width: 900, height: 700, regions: [
    { kind: 'division', x: 430, y: 0, width: 32, height: 700 },
    { kind: 'occlusion', x: 860, y: 200, width: 40, height: 100 },
  ] });
  assert.equal(panes?.preview.width, 430);
  assert.equal(panes?.commands.width, 398);
});

test('closing returns to responsive layout and malformed region values are ignored', () => {
  assert.equal(getDuoPanes({ width: 390, height: 844, regions: [] }), null);
  assert.equal(getDuoPanes({ width: 900, height: 700, regions: [{ kind: 'division', x: NaN, y: 0, width: 20, height: 700 }] }), null);
});
