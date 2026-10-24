import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWorkspaceEditorPage } from '../src/workspace-editor.js';

test('editor creates file options using textContent, never HTML interpolation', () => {
  const page = renderWorkspaceEditorPage();
  assert.match(page, /document\.createElement\('option'\)/);
  assert.match(page, /option\.textContent = file\.path/);
  assert.match(page, /option\.value = file\.path/);
  assert.match(page, /files\.replaceChildren\(\)/);
  assert.doesNotMatch(page, /files\.innerHTML\s*=/);
});

test('editor page does not embed arbitrary file names in executable markup', () => {
  const page = renderWorkspaceEditorPage();
  assert.match(page, /for \(const file of \(body\.workspace\.files/);
  assert.doesNotMatch(page, /<option value=['\"][^\n]*file\.path/);
});
