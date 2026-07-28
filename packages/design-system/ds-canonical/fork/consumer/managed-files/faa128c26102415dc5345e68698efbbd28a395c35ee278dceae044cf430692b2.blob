import * as platformPath from 'node:path'

export function isContainedPath(root, target, { allowRoot = false, pathApi = platformPath } = {}) {
  if (!pathApi || typeof pathApi.resolve !== 'function' || typeof pathApi.relative !== 'function'
    || typeof pathApi.isAbsolute !== 'function' || typeof pathApi.sep !== 'string') {
    throw new TypeError('path containment requires a complete path implementation')
  }
  const rel = pathApi.relative(pathApi.resolve(root), pathApi.resolve(target))
  if (!rel) return allowRoot
  return rel !== '..' && !rel.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(rel)
}
