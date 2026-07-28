// Backward-compatible facade. The provider registry is the only matcher-alias owner;
// root and fork projections both call the same data-driven projector.
import {
  PROVIDER_REGISTRY,
  projectMatcherForProvider,
} from '../gen-codex-adapter.mjs'

export function codexHookMatcher(matcher) {
  return projectMatcherForProvider(matcher, 'codex')
}

export const CODEX_TOOL_ALIASES = Object.freeze(structuredClone(
  PROVIDER_REGISTRY.providers.find((provider) => provider.id === 'codex')?.adapter.hookView?.matcherAliases || {},
))
