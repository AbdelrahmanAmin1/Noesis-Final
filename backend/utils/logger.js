'use strict';

const fmt = (level, args) => {
  const ts = new Date().toISOString();
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  return `[${ts}] ${level} ${msg}`;
};

module.exports = {
  info: (...a) => console.log(fmt('INFO', a)),
  warn: (...a) => console.warn(fmt('WARN', a)),
  error: (...a) => console.error(fmt('ERROR', a)),
  debug: (...a) => { if (process.env.DEBUG) console.log(fmt('DEBUG', a)); },
};
