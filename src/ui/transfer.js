export const supportsFS = 'showDirectoryPicker' in window

export async function findBrytonDrive() {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (e) {
    return null
  }
}

export async function writeFilesToDir(rootDir, name, files) {
  let tracksDir
  try {
    tracksDir = await rootDir.getDirectoryHandle('Tracks', { create: true })
  } catch (e) {
    throw new Error('Impossible de créer Tracks/ : ' + e.message)
  }

  for (const ext of ['smy', 'tinfo', 'track']) {
    const fname = name + '.' + ext
    if (files[fname] === undefined) continue
    const fh = await tracksDir.getFileHandle(fname, { create: true })
    const w = await fh.createWritable()
    await w.write(files[fname])
    await w.close()
  }

  let subDir
  try {
    subDir = await tracksDir.getDirectoryHandle(name, { create: true })
  } catch (e) {
    throw new Error('Impossible de créer ' + name + '/ : ' + e.message)
  }

  for (const fname of ['dupli.track', 'list.junc', 'list2.junc', 'sort1.path']) {
    if (files[fname] === undefined) continue
    const fh = await subDir.getFileHandle(fname, { create: true })
    const w = await fh.createWritable()
    await w.write(files[fname])
    await w.close()
  }
}
