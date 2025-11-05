import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'foodsharing-watcher'

// List of secrets to set from environment
const SECRET_NAMES = [
  'FOODWATCH_LOGIN_EMAIL',
  'FOODWATCH_LOGIN_PASSWORD',
  'FOODWATCH_SMTP_HOST',
  'FOODWATCH_SMTP_PORT',
  'FOODWATCH_SMTP_USER',
  'FOODWATCH_SMTP_PASS',
  'FOODWATCH_NOTIFY_FROM',
  'FOODWATCH_NOTIFY_TO',
]

function getFirebaseBin() {
  const bin = process.platform === 'win32'
    ? join(process.cwd(), 'node_modules', '.bin', 'firebase.cmd')
    : join(process.cwd(), 'node_modules', '.bin', 'firebase')
  if (!existsSync(bin)) {
    throw new Error(`Firebase CLI not found at ${bin}. Make sure dev dependency 'firebase-tools' is installed.`)
  }
  return bin
}

function setSecret(name, value) {
  try {
    const firebaseBin = getFirebaseBin()
    const args = [
      'functions:secrets:set',
      name,
      '--project', PROJECT,
    ]
    // Pass value via stdin (Firebase CLI reads from stdin)
    if (process.platform === 'win32') {
      execFileSync('cmd.exe', ['/c', firebaseBin, ...args], {
        input: value + '\n',
        stdio: ['pipe', 'inherit', 'inherit']
      })
    } else {
      execFileSync(firebaseBin, args, {
        input: value + '\n',
        stdio: ['pipe', 'inherit', 'inherit']
      })
    }
  } catch (err) {
    console.error(`Failed setting secret ${name}:`, err?.message || err)
    process.exitCode = 1
  }
}

let anySet = false
for (const name of SECRET_NAMES) {
  const v = process.env[name]
  if (v && String(v).length > 0) {
    anySet = true
    console.log(`Setting secret: ${name}`)
    setSecret(name, String(v))
  } else {
    console.warn(`Skipping ${name}: not provided in environment`)
  }
}

if (!anySet) {
  console.warn('No secrets were set. Ensure your environment variables are loaded (.env or system env).')
}
