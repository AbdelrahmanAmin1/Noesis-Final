'use strict';

const fs = require('fs');
const path = require('path');
const Babel = require('./vendor/babel.min.js');

const root = __dirname;
const sources = [
  'api.js',
  'components/Icons.jsx',
  'components/Shell.jsx',
  'components/Hero3D.jsx',
  'components/Ambient3D.jsx',
  'components/Splash.jsx',
  'components/Landing.jsx',
  'components/Auth.jsx',
  'components/Dashboard.jsx',
  'components/Materials.jsx',
  'components/Tutor.jsx',
  'components/TutorAvatar.jsx',
  'components/useSpeechRecognition.jsx',
  'components/TutorChat.jsx',
  'components/TutorHome.jsx',
  'components/LearningMap.jsx',
  'components/MaterialMindMap.jsx',
  'components/StoryboardReview.jsx',
  'components/StudyPlan.jsx',
  'components/LessonRenderer.jsx',
  'components/Study.jsx',
  'components/Other.jsx',
  'components/Community.jsx',
  'components/App.jsx',
];

const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, 'app.bundle.js');
fs.mkdirSync(outDir, { recursive: true });

const chunks = [
  `'use strict';`,
  `window.__NOESIS_BOOT = { startedAt: Date.now(), files: [] };`,
];

for (const rel of sources) {
  const abs = path.join(root, rel);
  const source = fs.readFileSync(abs, 'utf8');
  const isJsx = rel.endsWith('.jsx');
  const code = isJsx
    ? Babel.transform(source, {
        presets: ['react'],
        sourceType: 'script',
        filename: rel,
        compact: false,
        comments: false,
      }).code
    : source;

  chunks.push(`
// ---- ${rel} ----
(function () {
  window.__NOESIS_BOOT.files.push(${JSON.stringify(rel)});
${code}
})();
`);
}

fs.writeFileSync(outFile, chunks.join('\n'), 'utf8');
console.log(`Built ${path.relative(root, outFile)} from ${sources.length} files`);
