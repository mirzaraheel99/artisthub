import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFromUrl, normalizeCode } from '../referralCodes.ts';

test('a valid code is uppercased and accepted', () => {
  assert.equal(normalizeCode('abc2345'), 'ABC2345');
  assert.equal(normalizeCode('  ABC2345  '), 'ABC2345');
});

test('codes containing ambiguous glyphs are rejected', () => {
  // The generator never produces 0 O 1 I L, so a code containing one was
  // mistyped. Rejecting it here beats attributing the referral to nobody.
  for (const bad of ['ABC234O', 'ABC2340', 'ABC234I', 'ABC2341', 'ABC234L']) {
    assert.equal(normalizeCode(bad), null, `${bad} should be rejected`);
  }
});

test('wrong-length input is rejected', () => {
  assert.equal(normalizeCode('ABC234'), null);
  assert.equal(normalizeCode('ABC23456'), null);
  assert.equal(normalizeCode(''), null);
});

test('punctuation and spacing inside a code are rejected', () => {
  assert.equal(normalizeCode('ABC-2345'), null);
  assert.equal(normalizeCode('ABC 2345'), null);
});

test('a code is pulled from the custom scheme', () => {
  assert.equal(codeFromUrl('artisthub://join/ABC2345'), 'ABC2345');
  assert.equal(codeFromUrl('artisthub://ABC2345'), 'ABC2345');
});

test('a code is pulled from the web landing page', () => {
  // This is the shape that matters most: a link shared into a group chat opens
  // the web page on a phone that does not have the app yet.
  assert.equal(codeFromUrl('https://example.com/join/ABC2345'), 'ABC2345');
  assert.equal(codeFromUrl('https://example.com/?ref=ABC2345'), 'ABC2345');
  assert.equal(codeFromUrl('https://example.com/join/ABC2345?utm_source=ig'), 'ABC2345');
});

test('a link carrying no code returns null rather than guessing', () => {
  assert.equal(codeFromUrl('https://example.com/'), null);
  assert.equal(codeFromUrl('https://example.com/artists/some-artist'), null);
  assert.equal(codeFromUrl('artisthub://join/'), null);
});

test('a malformed link returns null rather than throwing', () => {
  assert.equal(codeFromUrl('not a url'), null);
  assert.equal(codeFromUrl(''), null);
});
