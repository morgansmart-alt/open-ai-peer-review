import type { RoundKind } from "../domain/types.ts"

export function kindLabel(kind: RoundKind): string {
  switch (kind) {
    case "claim":
      return "Claim"
    case "source-check":
      return "Source check"
    case "rebuttal":
      return "Response"
    case "counter":
      return "Counter"
    case "recheck":
      return "Re-check"
    case "comment":
      return "Comment"
  }
}
