// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — barrel re-export.
// See module headers in `./family-registry.ts`, `./bitmask.ts` and
// `./wang-tile-resolver-system.ts` for the full surface description.

export {
  clearWangTileFamilies,
  getWangTileFamily,
  listWangTileFamilies,
  registerWangTileFamily,
  type WangTileFamily,
  type WangTileVariant
} from "./family-registry";

export {
  computeWangBitmask,
  resolveVariantIndex,
  type SameFamilyPredicate
} from "./bitmask";

export {
  createWangTileResolverSystem,
  resolveAll,
  WANG_TILE,
  WANG_TILE_FAMILY_MEMBER,
  type SameFamilyPredicateFactory,
  type WangTileComponent,
  type WangTileFamilyMemberComponent,
  type WangTileResolverSystemOptions
} from "./wang-tile-resolver-system";
