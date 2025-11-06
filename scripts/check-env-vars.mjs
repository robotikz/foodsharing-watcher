#!/usr/bin/env node
/**
 * Check and clear environment variables from Cloud Run service
 *
 * This script checks what environment variables are set in Cloud Run
 * and removes any that conflict with secrets.
 *
 * Usage: node scripts/check-env-vars.mjs
 */

import { execSync } from 'node:child_process'

const PROJECT = 'foodsharing-watcher'
const FUNCTION_NAME = 'proxy'
const REGION = 'europe-west3'

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

console.log('Checking Cloud Run service for environment variables...\n')

try {
  // Get the current service configuration
  const command = `gcloud run services describe ${FUNCTION_NAME} --region=${REGION} --project=${PROJECT} --format=json`
  console.log(`Running: ${command}\n`)

  const output = execSync(command, { encoding: 'utf-8' })
  const service = JSON.parse(output)

  // Check for environment variables
  const envVars = service.spec?.template?.spec?.containers?.[0]?.env || []

  if (envVars.length === 0) {
    console.log('✓ No regular environment variables found in Cloud Run service.\n')
    console.log('The conflict might be coming from:')
    console.log('1. Cached configuration - try deploying again')
    console.log('2. Build-time environment variables')
    console.log('3. A Firebase Functions v2 bug\n')

    console.log('Try deploying with explicit environmentVariables:')
    console.log('  Update server/proxy.mjs to explicitly set environmentVariables: {}')
    process.exit(0)
  }

  console.log(`Found ${envVars.length} environment variable(s):\n`)

  const conflictingVars = []
  envVars.forEach(envVar => {
    const name = envVar.name
    const value = envVar.value ? '[HIDDEN]' : envVar.valueFrom?.secretKeyRef?.name || '[SECRET]'
    console.log(`  - ${name}: ${value}`)

    if (SECRET_VARS.includes(name)) {
      conflictingVars.push(name)
    }
  })

  if (conflictingVars.length > 0) {
    console.log(`\n⚠ Found ${conflictingVars.length} conflicting variable(s):`)
    conflictingVars.forEach(v => console.log(`  - ${v}`))
    console.log('\nRemoving conflicting variables...\n')

    const removeCommand = `gcloud run services update ${FUNCTION_NAME} ` +
      `--region=${REGION} ` +
      `--project=${PROJECT} ` +
      `--remove-env-vars=${conflictingVars.join(',')} ` +
      `--quiet`

    console.log(`Running: ${removeCommand}\n`)
    execSync(removeCommand, { stdio: 'inherit' })

    console.log('\n✓ Successfully removed conflicting environment variables!')
  } else {
    console.log('\n✓ No conflicting environment variables found.')
    console.log('The error might be caused by cached configuration.')
  }

} catch (error) {
  if (error.message.includes('not found')) {
    console.error('\n✗ Service not found. Make sure the function has been deployed at least once.')
  } else {
    console.error('\n✗ Error:', error.message)
    console.error('\nMake sure gcloud is installed and authenticated:')
    console.error('  gcloud auth login')
    console.error('  gcloud config set project', PROJECT)
  }
  process.exit(1)
}
