const HASH_ITERATIONS = process.env.NODE_ENV === 'test' ? 1000 : 100000
const KEY_LEN = 64
const DIGEST = 'sha512'

export default {
  HASH_ITERATIONS,
  KEY_LEN,
  DIGEST
}