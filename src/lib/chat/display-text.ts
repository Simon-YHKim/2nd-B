function urlRanges(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s<>]+/g), match =>
    [match.index, match.index + match[0].length] as const);
}

/** Presentation only. Never use this for stored turns, copying or wiki capture. */
export function chatDisplayText(text: string): string {
  // Code contents and links are literal. In particular, underscores in a URL
  // must not become emphasis; fenced code keeps its text and every newline.
  let sentinel = "\u0000";
  while (text.includes(sentinel)) sentinel += "\u0000";
  const literals: string[] = [];
  const originalUrls = urlRanges(text);
  let display = text.replace(/(?<!\\)(?:```[\s\S]*?(?<!\\)```|`[^`\r\n]+(?<!\\)`)|!?\[[^\]\r\n]*\]\([^\s)]*\)/g, (part, offset: number) => {
    if (originalUrls.some(([start, end]) => offset >= start && offset < end)) return part;
    literals.push(part.startsWith("`") ? part.replace(/^`{1,3}|`{1,3}$/g, "") : part);
    return `${sentinel}${literals.length - 1}${sentinel}`;
  }).replace(/^([ \t]{0,3})#{1,6}[ \t]+/gm, "$1");
  for (const marker of ["***", "___", "**", "__", "*", "_"]) {
    const escaped = marker.replace(/\*/g, "\\*");
    // Word-internal underscores and arithmetic such as 2*3*4 are literal.
    const before = marker[0] === "_" || marker === "*" ? "[\\p{L}\\p{N}_*\\\\]" : "[*\\\\]";
    const after = marker[0] === "_" ? "[\\p{L}\\p{N}_]" : "[*]";
    let urls = urlRanges(display);
    display = display.replace(new RegExp(`(?<!${before})${escaped}(?![${marker[0]}])(?=\\S)((?:(?!${escaped})[\\s\\S])*?\\S)(?<![${marker[0]}\\\\])${escaped}(?!${after})`, "gu"), (full, content: string, offset: number) => {
      // A URL may be inside emphasis, but its own characters are never markup.
      if (urls.some(([start, end]) => offset >= start && offset < end)) return full;
      // The closing delimiter also ends a wrapped URL, even without whitespace.
      // Keep those URLs literal across later passes and allow following emphasis.
      const contentEnd = offset + full.length - marker.length;
      urls = urls.map(([start, end]) => start >= offset && start < contentEnd
        ? [start, Math.min(end, contentEnd)] as const : [start, end] as const);
      return content.replace(/https?:\/\/[^\s<>]+/g, url => {
        literals.push(url);
        return `${sentinel}${literals.length - 1}${sentinel}`;
      });
    });
  }
  return display.split(sentinel).map((part, index) => index % 2 === 1 ? literals[Number(part)] : part).join("");
}
