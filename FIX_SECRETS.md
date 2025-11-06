# Fix Firebase Secrets Conflict

## Problem
The error indicates that `FOODWATCH_SMTP_HOST` (and possibly other variables) are defined both as secrets AND as regular environment variables, causing a deployment conflict.

## Solution

### Option 1: Remove Regular Environment Variables (Recommended)

Since all these variables are declared as secrets in `server/proxy.mjs`, they should ONLY exist as secrets, not as regular environment variables.

1. **Check Firebase Console for regular env vars:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project: `foodsharing-watcher`
   - Go to Functions → Configuration
   - Look for "Environment variables" section
   - Remove any variables that match these names:
     - `FOODWATCH_SMTP_HOST`
     - `FOODWATCH_SMTP_PORT`
     - `FOODWATCH_SMTP_USER`
     - `FOODWATCH_SMTP_PASS`
     - `FOODWATCH_NOTIFY_FROM`
     - `FOODWATCH_NOTIFY_TO`
     - `FOODWATCH_LOGIN_EMAIL`
     - `FOODWATCH_LOGIN_PASSWORD`

2. **Or use Firebase CLI:**
   ```bash
   # List current config (if using old config system)
   firebase functions:config:get

   # Remove conflicting variables
   firebase functions:config:unset smtp.host smtp.port smtp.user smtp.pass notify.from notify.to login.email login.password
   ```

### Option 2: Verify Secrets Are Set

Make sure all secrets are properly set in Google Cloud Secret Manager:

```bash
# Check if secrets exist
gcloud secrets list --project foodsharing-watcher | grep FOODWATCH

# If missing, set them using the script
npm run secrets:set
```

### Option 3: Clean Deployment

After removing conflicting env vars:

```bash
# Login to Firebase
firebase login

# Deploy functions again
npm run deploy:functions
```

## Verify

After fixing, verify that:
- ✅ All secrets are set in Google Cloud Secret Manager
- ✅ No regular environment variables exist for these secrets
- ✅ The function only references secrets in the `secrets` array
