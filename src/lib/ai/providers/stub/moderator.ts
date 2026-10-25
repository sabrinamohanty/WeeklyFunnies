import type { CallContext, ModerationCategory, ModerationResult, Moderator } from "../../types";

// Keyword rules for development and tests only. They are deliberately simple and are not real
// moderation; config refuses MODERATION_PROVIDER=stub in production.

const BLOCK: Array<[ModerationCategory, RegExp]> = [
  [
    "self_harm",
    /\b(kill(ing)? myself|end(ing)? (my|it all)( life)?|suicid\w*|self[- ]?harm|hurt(ing)? myself|want(ed)? to die)\b/i,
  ],
  ["violence", /\b(going to|gonna|will|want to) (hurt|kill|attack|shoot|stab|beat up)\b/i],
  ["harassment", /\b(worthless|pathetic|disgusting)\b|\btell \p{L}+ how (ugly|stupid)\b/iu],
  ["hate", /\bMW_TEST_SLUR\b/i],
];

const SENSITIVE: Array<[ModerationCategory, RegExp]> = [
  [
    "grief",
    /\b(passed away|died|death|funeral|grie(f|ving)|lost my (mom|dad|mother|father|grand\w+|friend))\b/i,
  ],
  ["illness", /\b(diagnos\w*|cancer|chemo\w*|treatment|hospital\w*|surgery|illness)\b/i],
  ["breakup", /\b(broke up|break ?up|divorc\w*|separated)\b/i],
  ["job_loss", /\b(laid off|got fired|lost my job|redundan\w*)\b/i],
];

const PROFANITY = /\b(damn|hell|crap|freaking)\b/i;

export class StubModerator implements Moderator {
  readonly id = "stub";

  async checkText(text: string, _ctx: CallContext): Promise<ModerationResult> {
    const blocked = BLOCK.filter(([, re]) => re.test(text)).map(([c]) => c);
    if (blocked.length) return { decision: "block", categories: blocked };
    const sensitive = SENSITIVE.filter(([, re]) => re.test(text)).map(([c]) => c);
    const categories: ModerationCategory[] = [
      ...sensitive,
      ...(PROFANITY.test(text) ? (["profanity"] as const) : []),
    ];
    return { decision: sensitive.length ? "sensitive" : "allow", categories };
  }
}
