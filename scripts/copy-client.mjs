import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })
copyFileSync('src/client.js', 'lib/client.js')
