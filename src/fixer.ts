export interface VerifierError {
  code: string;
  line?: number;
  detail?: string;
}

export interface FixResult {
  fixed: string;
  applied: string[];
}

export function tryDeterministicFix(
  markdown: string,
  errors: VerifierError[]
): FixResult {
  let fixed = markdown;
  const applied: string[] = [];
  const errorCodes = new Set(errors.map((e) => e.code));

  // 1. A5: Truncate prefixes longer than 5 letters (e.g. DEVOPS-01 -> DEVOP-01)
  if (errorCodes.has('A5')) {
    const longPrefixRegex = /-\s*\*\*([A-Z]{6,})-(\d{2,3})\*\*/g;
    const prefixesToTruncate = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = longPrefixRegex.exec(fixed)) !== null) {
      prefixesToTruncate.add(match[1]);
    }

    for (const oldPrefix of prefixesToTruncate) {
      const newPrefix = oldPrefix.slice(0, 5);
      // Replace in rule declarations and in checklist citations
      const replaceRegex = new RegExp(`\\b${oldPrefix}-(\\d{2,3})\\b`, 'g');
      fixed = fixed.replace(replaceRegex, `${newPrefix}-$1`);
      applied.push(`[TIER 0] Truncated prefix ${oldPrefix} → ${newPrefix}`);
    }
  }

  // 2. A7: Append missing | conf: N (1..5) to rule lines
  if (errorCodes.has('A7')) {
    const lines = fixed.split('\n');
    let modifiedA7 = false;

    const newLines = lines.map((line) => {
      // If line is a rule line with WHEN and -> DO, but lacks | conf: N
      if (
        line.trim().startsWith('- **') &&
        line.includes('WHEN') &&
        (line.includes('→ DO') || line.includes('-> DO'))
      ) {
        if (!/\|\s*conf:\s*[1-5]\s*$/i.test(line.trim())) {
          modifiedA7 = true;
          const ruleIdMatch = line.match(/-\s*\*\*([A-Z0-9_-]+)\*\*/);
          const ruleId = ruleIdMatch ? ruleIdMatch[1] : 'rule';
          applied.push(`[TIER 0] Appended conf: 3 to rule ${ruleId}`);
          return `${line.trimEnd()} | conf: 3`;
        }
      }
      return line;
    });

    if (modifiedA7) {
      fixed = newLines.join('\n');
    }
  }

  // 3. A9: Ensure Section 5 contains GATE: PASS, GATE: FAIL, and INSIGHT
  if (errorCodes.has('A9')) {
    const sec5Match = fixed.match(/(## 5\.[^\n]*\n)([\s\S]*?)(?=(## 6\.|\n#|$))/i);
    if (sec5Match) {
      const sec5Header = sec5Match[1];
      const sec5Body = sec5Match[2];

      const hasGatePass = sec5Body.includes('GATE: PASS');
      const hasGateFail = sec5Body.includes('GATE: FAIL');
      const hasInsight = sec5Body.includes('INSIGHT');

      if (!hasGatePass || !hasGateFail || !hasInsight) {
        const standardGateText =
          `- **Gate**: Evaluate all hard restrictions. Output **GATE: PASS** if every rule is satisfied, otherwise **GATE: FAIL** with the failing rule IDs.\n` +
          `- **Insight**: Provide detailed observations and diagnostic recommendations. Output format: **INSIGHT** [details].\n\n`;

        const newSec5 = `${sec5Header}${standardGateText}`;
        fixed = fixed.replace(sec5Match[0], newSec5);
        applied.push('[TIER 0] Appended missing Gate/Insight block');
      }
    }
  }

  // 4. A8: Remove checklist items that cite non-existent rule IDs
  if (errorCodes.has('A8')) {
    // Collect all valid rule IDs defined in Section 3
    const sec3Match = fixed.match(/## 3\.[^\n]*\n([\s\S]*?)(?=## 4\.|\n#|$)/i);
    const validSection3Ids = new Set<string>();
    if (sec3Match) {
      const ruleMatches = sec3Match[1].matchAll(/-\s*\*\*([A-Z]{1,5}-\d{2,3})\*\*/g);
      for (const m of ruleMatches) {
        validSection3Ids.add(m[1]);
      }
    }

    const sec4Match = fixed.match(/(## 4\.[^\n]*\n)([\s\S]*?)(?=(## 5\.|\n#|$))/i);
    if (sec4Match) {
      const sec4Header = sec4Match[1];
      const sec4Lines = sec4Match[2].split('\n');
      const filteredLines: string[] = [];

      for (const line of sec4Lines) {
        if (line.trim().startsWith('- [')) {
          const idMatch = line.match(/\b([A-Z]{1,5}-\d{2,3})\b/);
          if (idMatch) {
            const citedId = idMatch[1];
            if (!validSection3Ids.has(citedId)) {
              applied.push(`[TIER 0] Removed unresolved checklist reference to ${citedId}`);
              continue; // Drop unresolved checklist item
            }
          }
        }
        filteredLines.push(line);
      }

      const newSec4 = `${sec4Header}${filteredLines.join('\n')}`;
      fixed = fixed.replace(sec4Match[0], newSec4);
    }
  }

  // Note: A3 (missing sections) is intentionally omitted from deterministic fixes
  // because structural rewrites require semantic reasoning from the Advisor.

  return {
    fixed,
    applied,
  };
}
