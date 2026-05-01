'use strict';

const path = require('path');

function packageBinary(packageName) {
  try {
    return require(packageName).path || null;
  } catch (_) {
    return null;
  }
}

function isGenericCommand(value, commandName) {
  const v = String(value || '').trim().toLowerCase();
  return !v || v === commandName || v === `${commandName}.exe`;
}

function resolveBinary(configured, commandName, packageName) {
  if (!isGenericCommand(configured, commandName)) return configured;
  return packageBinary(packageName) || configured || commandName;
}

function spawnMissingMessage(commandName, binaryPath, err) {
  const platformHint = process.platform === 'win32'
    ? `Install ${commandName} or leave ${commandName.toUpperCase()}_PATH unset so Noesis can use the bundled Windows binary.`
    : `Install ${commandName} or leave ${commandName.toUpperCase()}_PATH unset so Noesis can use the bundled binary.`;
  return `${commandName}_not_found: could not execute "${binaryPath}". ${platformHint} Original error: ${err.message}`;
}

function concatListPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/').replace(/'/g, "'\\''");
}

module.exports = {
  resolveBinary,
  spawnMissingMessage,
  concatListPath,
  FFMPEG_PACKAGE: '@ffmpeg-installer/ffmpeg',
  FFPROBE_PACKAGE: '@ffprobe-installer/ffprobe',
};
