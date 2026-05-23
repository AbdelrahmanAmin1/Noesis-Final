'use strict';

function splitCodeLines(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  return lines.length ? lines : [''];
}

function parseLineRange(value, limit = 80) {
  const text = String(value || '').trim();
  const match = text.match(/(\d+)\s*(?:[-–—]\s*(\d+))?/);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const out = [];
  for (let line = lo; line <= hi && out.length < limit; line += 1) out.push(line);
  return out;
}

function normalizeHighlightLines(input, totalLines) {
  const raw = Array.isArray(input && input.highlightLines) && input.highlightLines.length
    ? input.highlightLines
    : parseLineRange(input && input.lineRange);
  const seen = new Set();
  return raw
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 1 && n <= totalLines)
    .filter(n => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
}

function lineRangeLabel(lines) {
  if (!lines || !lines.length) return '';
  return lines.length === 1 ? `Line ${lines[0]}` : `Lines ${lines[0]}-${lines[lines.length - 1]}`;
}

function normalizeCodeWindow(input = {}, opts = {}) {
  const maxVisibleLines = Math.max(4, Number(opts.maxVisibleLines || input.maxVisibleLines || 12));
  const contextBefore = Math.max(0, Number(opts.contextBefore == null ? 2 : opts.contextBefore));
  const content = String(input.content || input.code || '');
  const rawLines = splitCodeLines(content);
  const totalLines = rawLines.length || 1;
  const requestedLines = Array.isArray(input.highlightLines) && input.highlightLines.length
    ? input.highlightLines.map(Number).filter(Number.isFinite)
    : parseLineRange(input.lineRange);
  const warnings = [];
  if (requestedLines.some(n => n < 1 || n > totalLines)) warnings.push('code_line_range_outside_source');

  let highlightLines = normalizeHighlightLines(input, totalLines);
  if (!highlightLines.length) {
    const fallbackLine = Math.max(1, Math.min(totalLines, Number(input.visibleStartLine || 1) || 1));
    highlightLines = [fallbackLine];
  }

  const firstHighlight = Math.min(...highlightLines);
  const lastHighlight = Math.max(...highlightLines);
  let visibleStartLine = Number(input.visibleStartLine || 0);
  let visibleEndLine = Number(input.visibleEndLine || 0);

  if (!Number.isFinite(visibleStartLine) || visibleStartLine < 1) {
    visibleStartLine = Math.max(1, firstHighlight - contextBefore);
  }
  if (!Number.isFinite(visibleEndLine) || visibleEndLine < visibleStartLine) {
    visibleEndLine = visibleStartLine + maxVisibleLines - 1;
  }

  visibleStartLine = Math.max(1, Math.min(totalLines, Math.floor(visibleStartLine)));
  visibleEndLine = Math.max(visibleStartLine, Math.min(totalLines, Math.floor(visibleEndLine)));

  if (visibleEndLine - visibleStartLine + 1 > maxVisibleLines) {
    visibleEndLine = visibleStartLine + maxVisibleLines - 1;
  }
  if (lastHighlight > visibleEndLine) {
    visibleEndLine = Math.min(totalLines, lastHighlight);
    visibleStartLine = Math.max(1, visibleEndLine - maxVisibleLines + 1);
  }
  if (firstHighlight < visibleStartLine) {
    visibleStartLine = Math.max(1, firstHighlight);
    visibleEndLine = Math.min(totalLines, visibleStartLine + maxVisibleLines - 1);
  }

  const visibleSet = new Set();
  for (let n = visibleStartLine; n <= visibleEndLine; n += 1) visibleSet.add(n);
  const invisibleHighlights = highlightLines.filter(n => !visibleSet.has(n));
  if (invisibleHighlights.length) warnings.push('highlight_lines_not_visible');
  if (highlightLines.length > maxVisibleLines) warnings.push('highlight_range_exceeds_viewport');

  const displayLines = rawLines
    .slice(visibleStartLine - 1, visibleEndLine)
    .map((text, i) => {
      const number = visibleStartLine + i;
      return {
        number,
        text: String(text || '').replace(/\t/g, '  '),
        highlight: highlightLines.includes(number),
      };
    });

  const normalizedRange = input.lineRange || lineRangeLabel(highlightLines).replace(/^Lines?\s+/i, '');
  return {
    ...input,
    language: input.language || 'text',
    content,
    lineRange: normalizedRange,
    visibleStartLine,
    visibleEndLine,
    highlightLines,
    displayLines,
    totalLines,
    warnings,
    pointers: Array.isArray(input.pointers) ? input.pointers : [],
  };
}

function codeWindowIsVisible(input = {}, opts = {}) {
  const normalized = normalizeCodeWindow(input, opts);
  const visible = new Set();
  for (let n = normalized.visibleStartLine; n <= normalized.visibleEndLine; n += 1) visible.add(n);
  return normalized.highlightLines.length > 0 && normalized.highlightLines.every(n => visible.has(n));
}

module.exports = {
  splitCodeLines,
  parseLineRange,
  normalizeCodeWindow,
  codeWindowIsVisible,
  lineRangeLabel,
};
