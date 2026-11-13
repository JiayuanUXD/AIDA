// Extract a JSON payload from model output and repair common formatting
// issues without touching characters inside string values.
const stripOutsideStrings = (src: string): string => {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === "}" || src[j] === "]") continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let key = "";
      while (j < src.length && src[j] !== "'") {
        key += src[j];
        j++;
      }
      let k = j + 1;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[j] === "'" && src[k] === ":" && /^\w+$/.test(key)) {
        out += `"${key}"`;
        i = j;
        continue;
      }
    }
    out += ch;
  }
  return out;
};

export const cleanAiJson = (content: string): string => {
  let cleanContent = content;

  const firstBracket = content.indexOf('[');
  const firstBrace = content.indexOf('{');
  const lastBracket = content.lastIndexOf(']');
  const lastBrace = content.lastIndexOf('}');

  let start = -1;
  let end = -1;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = lastBracket;
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = lastBrace;
  }

  if (start !== -1 && end !== -1 && end > start) {
    cleanContent = content.substring(start, end + 1);
  }

  return stripOutsideStrings(cleanContent).trim();
};