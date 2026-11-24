/**
 * Fold both sides of a quotation check so PDF and Zenodo text can match.
 * NFKC expands compatibility ligatures (ﬁ, ﬂ, ﬃ). Smart quotes, dashes,
 * and whitespace are folded after that. The stored quote is left unchanged.
 */
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u2032]/g
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u2033]/g
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g
const INVISIBLE = /\u00AD|\u200B|\u200C|\u200D|\uFEFF/g

export function normaliseQuoteText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}
