import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeUrlFor } from '../deepLinkUrls.ts';

test('spotify: track links become spotify:track:ID', () => {
  assert.equal(
    nativeUrlFor('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'spotify'),
    'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
  );
});

test('spotify: locale-prefixed share links still resolve', () => {
  assert.equal(
    nativeUrlFor('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT?si=abc', 'spotify'),
    'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
  );
});

test('spotify: album and artist links keep their kind', () => {
  assert.equal(nativeUrlFor('https://open.spotify.com/album/AAA', 'spotify'), 'spotify:album:AAA');
  assert.equal(nativeUrlFor('https://open.spotify.com/artist/BBB', 'spotify'), 'spotify:artist:BBB');
});

test('spotify: an unrecognised path falls back to https (null)', () => {
  assert.equal(nativeUrlFor('https://open.spotify.com/', 'spotify'), null);
  assert.equal(nativeUrlFor('https://open.spotify.com/track/', 'spotify'), null);
});

test('youtube: watch, short, shorts and embed forms all resolve', () => {
  assert.equal(nativeUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'), 'vnd.youtube://dQw4w9WgXcQ');
  assert.equal(nativeUrlFor('https://youtu.be/dQw4w9WgXcQ?t=30', 'youtube'), 'vnd.youtube://dQw4w9WgXcQ');
  assert.equal(nativeUrlFor('https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube'), 'vnd.youtube://dQw4w9WgXcQ');
  assert.equal(nativeUrlFor('https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube'), 'vnd.youtube://dQw4w9WgXcQ');
});

test('youtube: a channel link has no video id, so it falls back', () => {
  assert.equal(nativeUrlFor('https://www.youtube.com/@somechannel', 'youtube'), null);
});

test('apple: the protocol is swapped and the path preserved', () => {
  assert.equal(
    nativeUrlFor('https://music.apple.com/us/album/some-album/1234567890?i=999', 'apple'),
    'music://music.apple.com/us/album/some-album/1234567890?i=999',
  );
});

test('an unknown platform code always falls back to https', () => {
  // A platform added as a database row ships no native scheme until a build
  // supports it. Falling back is correct, not a failure.
  assert.equal(nativeUrlFor('https://tidal.com/track/123', 'tidal'), null);
});

test('a host that is not the expected platform is rejected', () => {
  // Guards against an admin pasting the wrong platform's URL into a field and
  // the app then generating a native URL that opens the wrong app.
  assert.equal(nativeUrlFor('https://evil.example.com/track/AAA', 'spotify'), null);
  assert.equal(nativeUrlFor('https://vimeo.com/watch?v=AAA', 'youtube'), null);
  assert.equal(nativeUrlFor('https://apple.com/music', 'apple'), null);
});

test('a lookalike host does not pass the suffix check', () => {
  assert.equal(nativeUrlFor('https://notspotify.com/track/AAA', 'spotify'), null);
  assert.equal(nativeUrlFor('https://myyoutube.com/watch?v=AAA', 'youtube'), null);
});

test('malformed and non-http input returns null rather than throwing', () => {
  assert.equal(nativeUrlFor('not a url', 'spotify'), null);
  assert.equal(nativeUrlFor('javascript:alert(1)', 'spotify'), null);
  assert.equal(nativeUrlFor('', 'youtube'), null);
});
