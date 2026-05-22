'use strict';

const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, 'dist', 'app.bundle.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');

const requiredMarkers = [
  'window.TutorChat',
  'window.TutorHome',
  'window.TutorAvatar',
  'window.useSpeechRecognition',
  'Continue last chat',
  'New messages',
  'Copy reply',
  'Loading your previous chat',
  'source-citation',
  'typing-dot',
];

const missing = requiredMarkers.filter(marker => !bundle.includes(marker));

if (missing.length) {
  throw new Error(`chat_bundle_missing_markers: ${missing.join(', ')}`);
}

console.log(`chat bundle ok (${requiredMarkers.length} markers)`);
