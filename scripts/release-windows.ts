/** Publish exact win32-x64 bytes from a native package job; never rebuild or retest. */
import { publishVerifiedTarget } from './release/publish-verified.js'

await publishVerifiedTarget('win32-x64')
