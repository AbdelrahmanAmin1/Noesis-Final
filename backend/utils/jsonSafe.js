'use strict';

const MAX_REPAIR_CHARS = 20000;

class JsonSafeError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.status = 422;
    this.code = code;
    this.details = details;
  }
}

function readBalanced(cleaned, start) {
  const openCh = cleaned[start];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

// Extract a balanced JSON object/array from a model response.
function extractJson(text) {
  if (!text) return null;
  // Strip code fences
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let fallback = null;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c !== '{' && c !== '[') continue;
    const candidate = readBalanced(cleaned, i);
    if (!candidate) continue;
    if (!fallback || candidate.length > fallback.length) fallback = candidate;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (_) {
      // Keep scanning; model outputs often contain bracketed citations before JSON.
    }
  }
  return fallback;
}

async function parseJsonSafe(text, schema, repairFn) {
  const candidate = extractJson(text);
  if (!candidate) {
    if (repairFn) return repairAndParse(text, schema, repairFn);
    throw new JsonSafeError('no_json_found');
  }
  try {
    const obj = JSON.parse(candidate);
    if (schema) {
      const result = schema.safeParse(obj);
      if (!result.success) {
        if (repairFn) return repairAndParse(text, schema, repairFn);
        throw new JsonSafeError('schema_mismatch', 'AI response did not match the expected schema', result.error.errors);
      }
      return result.data;
    }
    return obj;
  } catch (e) {
    if (repairFn) return repairAndParse(text, schema, repairFn);
    throw e;
  }
}

async function repairAndParse(rawText, schema, repairFn) {
  const clipped = String(rawText || '').slice(0, MAX_REPAIR_CHARS);
  const repaired = await repairFn(clipped);
  const candidate = extractJson(repaired);
  if (!candidate) throw new JsonSafeError('repair_failed_no_json');
  let obj;
  try {
    obj = JSON.parse(candidate);
  } catch (e) {
    throw new JsonSafeError('repair_failed_parse', 'Repaired AI response was not valid JSON');
  }
  if (schema) {
    const result = schema.safeParse(obj);
    if (!result.success) throw new JsonSafeError('repair_failed_schema', 'Repaired AI response did not match the expected schema', result.error.errors);
    return result.data;
  }
  return obj;
}

module.exports = { extractJson, parseJsonSafe, JsonSafeError };
