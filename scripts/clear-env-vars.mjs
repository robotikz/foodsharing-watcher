#!/usr/bin/env node
/**
 * Clear conflicting environment variables from Firebase Functions
 *
 * This script removes environment variables that conflict with secrets.
 * Run this if you get "overlaps non secret environment variable" errors.
 *
 * Usage: node scripts/clear-env-vars.mjs
 */

import { execSync } from 'node:child_process'

const PROJECT = 'foodsharing-watcher'
const FUNCTION_NAME = 'proxy'
const REGION = 'europe-west3'

// Variables that should ONLY be secrets, not regular env vars
const SECRET_VARS = [
  'FOODWATCH_LOGIN_EMAIL',
  'FOODWATCH_LOGIN_PASSWORD',
  'FOODWATCH_SMTP_HOST',
  'FOODWATCH_SMTP_PORT',
  'FOODWATCH_SMTP_USER',
  'FOODWATCH_SMTP_PASS',
  'FOODWATCH_NOTIFY_FROM',
  'FOODWATCH_NOTIFY_TO',
]

console.log('Clearing conflicting environment variables from Cloud Run service...\n')

try {
  // Use gcloud to remove environment variables from the Cloud Run service
  const serviceName = FUNCTION_NAME
  const fullServicePath = `projects/${PROJECT}/locations/${REGION}/services/${serviceName}`

  console.log(`Target service: ${fullServicePath}\n`)
  console.log('Variables to remove:')
  SECRET_VARS.forEach(v => console.log(`  - ${v}`))
  console.log('\nNote: These variables should be managed as secrets only.\n')

  // Build gcloud command to update the service and remove env vars
  const envVarsToRemove = SECRET_VARS.map(v => `--remove-env-vars=${v}`).join(' ')

  const command = `gcloud run services update ${serviceName} ` +
    `--region=${REGION} ` +
    `--project=${PROJECT} ` +
    `${envVarsToRemove} ` +
    `--quiet`

  console.log(`Running: ${command}\n`)
  execSync(command, { stdio: 'inherit' })

  console.log('\n✓ Successfully cleared conflicting environment variables!')
  console.log('You can now deploy the function with secrets only.')

} catch (error) {
  console.error('\n✗ Error clearing environment variables:')
  console.error(error.message)
  console.error('\nAlternative: Remove them manually from Firebase Console:')
  console.error('  https://console.firebase.google.com/project/' + PROJECT + '/functions')
  console.error('\nOr use gcloud directly:')
  console.error(`  gcloud run services update ${FUNCTION_NAME} --region=${REGION} --project=${PROJECT} --remove-env-vars=${SECRET_VARS.join(',')}`)
  process.exit(1)
}
