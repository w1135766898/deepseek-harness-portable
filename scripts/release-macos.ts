/** Publish exact darwin-arm64 bytes from a native package job; never rebuild or retest. */
import { publishVerifiedTarget } from './release/publish-verified.js'

await publishVerifiedTarget('darwin-arm64')
