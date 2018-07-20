import { posix as path } from 'path'

import { GitObjectManager } from '../managers/GitObjectManager'
import { GitRefManager } from '../managers/GitRefManager.js'
import { resolveTree } from '../utils/resolveTree'
import { GitWalkerSymbol } from '../utils/symbols'

import { GitTree } from './GitTree.js'

export class GitWalkerRepo {
  constructor ({ fs, gitdir, ref }) {
    this.fs = fs
    this.gitdir = gitdir
    this.mapPromise = (async () => {
      let map = new Map()
      let oid = await GitRefManager.resolve({ fs, gitdir, ref })
      let tree = await resolveTree({ fs, gitdir, oid })
      map.set('.', tree)
      return map
    })()
  }
  async readdir (entry) {
    if (entry === null) return []
    let filepath = entry.fullpath
    let { fs, gitdir } = this
    let map = await this.mapPromise
    let obj = map.get(filepath)
    if (!obj) throw new Error(`No obj for ${filepath}`)
    let oid = obj.oid
    if (!oid) throw new Error(`No oid for obj ${JSON.stringify(obj)}`)
    let { type, object } = await GitObjectManager.read({ fs, gitdir, oid })
    if (type === 'blob') return null
    if (type !== 'tree') {
      throw new Error(`ENOTDIR: not a directory, scandir '${filepath}'`)
    }
    let tree = GitTree.from(object)
    // cache all entries
    for (const entry of tree) {
      map.set(path.join(filepath, entry.path), entry)
    }
    return tree.entries().map(entry => ({
      fullpath: path.join(filepath, entry.path),
      basename: entry.path
    }))
  }
  async populateStat (entry) {
    // All we can add here is mode and type.
    let map = await this.mapPromise
    let stats = map.get(entry.fullpath)
    if (!stats) {
      throw new Error(
        `ENOENT: no such file or directory, lstat '${entry.fullpath}'`
      )
    }
    let { mode, type } = stats
    Object.assign(entry, { mode, type })
  }
  async populateContent (entry) {
    let map = await this.mapPromise
    let { fs, gitdir } = this
    let obj = map.get(entry.fullpath)
    if (!obj) throw new Error(`No obj for ${entry.fullpath}`)
    let oid = obj.oid
    if (!oid) throw new Error(`No oid for entry ${JSON.stringify(obj)}`)
    let { type, object } = await GitObjectManager.read({ fs, gitdir, oid })
    if (type === 'tree') {
      throw new Error(`EISDIR: illegal operation on a directory, read`)
    }
    Object.assign(entry, { content: object })
  }
  async populateHash (entry) {
    let map = await this.mapPromise
    let obj = map.get(entry.fullpath)
    if (!obj) {
      throw new Error(
        `ENOENT: no such file or directory, open '${entry.fullpath}'`
      )
    }
    let oid = obj.oid
    Object.assign(entry, { oid })
  }
}

const TREE = function TREE (ref) {
  return _TREE(ref)
}
Object.freeze(TREE)
export { TREE }

const _TREE = function (ref) {
  let o = Object.create(null)
  Object.defineProperty(o, GitWalkerSymbol, {
    value: function ({ fs, gitdir }) {
      console.log('ref = ', ref)
      return new GitWalkerRepo({ fs, gitdir, ref })
    }
  })
  return o
}