import { renameSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const envPath = join(process.cwd(), '.env')
const envBackupPath = join(process.cwd(), '.env.deploy-backup')

// Backup and hide .env during deployment
if (existsSync(envPath)) {
  console.log('Temporarily renaming .env for deployment...')
  renameSync(envPath, envBackupPath)
}

try {
  // Run Firebase deploy
  const firebaseBin = process.platform === 'win32'
    ? join(process.cwd(), 'node_modules', '.bin', 'firebase.cmd')
    : join(process.cwd(), 'node_modules', '.bin', 'firebase')

  const args = [
    'deploy',
    '--only',
    'functions:proxy',
    '--project',
    'foodsharing-watcher'
  ]

  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/c', firebaseBin, ...args], { stdio: 'inherit' })
  } else {
    execFileSync(firebaseBin, args, { stdio: 'inherit' })
  }
} finally {
  // Restore .env after deployment
  if (existsSync(envBackupPath)) {
    console.log('Restoring .env file...')
    renameSync(envBackupPath, envPath)
  }
}
