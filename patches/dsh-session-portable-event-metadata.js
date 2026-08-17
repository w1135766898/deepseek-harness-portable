'use strict'

/** Preserve the rc7 append contract while allowing explicit informational-event metadata. */
function patchSessionPortableEventMetadata(source) {
  if (source.includes('...eventOpts?.ignorable === true ? { ignorable: true } : {}')) return source
  if (source.includes('...sessionEventOpts?.ignorable === true ? { ignorable: true } : {}')) return source

  const marker = `\t\tconst surfaceOpts = opts[0];
\t\tconst surfaceMetadata = {
\t\t\t...surfaceOpts?.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: surfaceOpts.sourceEventSeqs },`
  const replacement = `\t\tconst eventOpts = opts[0];
\t\tconst surfaceOpts = eventOpts;
\t\tconst surfaceMetadata = {
\t\t\t...eventOpts?.ignorable === true ? { ignorable: true } : {},
\t\t\t...surfaceOpts?.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: surfaceOpts.sourceEventSeqs },`
  if (!source.includes(marker)) {
    throw new Error('dsh-session append source no longer matches the reviewed rc7 bundle')
  }
  const output = source.replace(marker, replacement)
  if (!output.includes('...eventOpts?.ignorable === true ? { ignorable: true } : {}')) {
    throw new Error('dsh-session metadata patch did not preserve the ignorable marker')
  }
  return output
}

module.exports = { patchSessionPortableEventMetadata }
