# Issues and Solutions

## Firebase Functions: Secret environment variable overlaps non secret environment variable

**Error:**
```
Secret environment variable overlaps non secret environment variable: FOODWATCH_SMTP_HOST
```

**Cause:**
Firebase Functions v2 detects that these variables exist as both secrets AND regular environment variables. This can happen even if you don't see them in Firebase Console - they might be cached in Cloud Run or set during a previous deployment.

**Solution:**

### ✅ Fixed in code (Recommended)
The code now explicitly sets `environmentVariables: {}` to prevent any conflicts. This should resolve the issue. Try deploying again:

```bash
npm run deploy:functions
```

### Option 1: Check what's actually set in Cloud Run
```bash
npm run check:env-vars
```

This will show you what environment variables are actually set in Cloud Run (which might differ from Firebase Console).

### Option 2: Clear conflicting variables via gcloud
```bash
npm run clear:env-vars
```

Or manually:
```bash
gcloud run services update proxy \
  --region=europe-west3 \
  --project=foodsharing-watcher \
  --remove-env-vars=FOODWATCH_SMTP_HOST,FOODWATCH_SMTP_PORT,FOODWATCH_SMTP_USER,FOODWATCH_SMTP_PASS,FOODWATCH_NOTIFY_FROM,FOODWATCH_NOTIFY_TO,FOODWATCH_LOGIN_EMAIL,FOODWATCH_LOGIN_PASSWORD
```

### Option 3: Manual removal via Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/project/foodsharing-watcher/functions)
2. Click on your function
3. Go to "Configuration" tab
4. Find "Environment Variables" section
5. Remove all variables that are declared as secrets in `server/proxy.mjs`

**Variables that should ONLY be secrets:**
- FOODWATCH_LOGIN_EMAIL
- FOODWATCH_LOGIN_PASSWORD
- FOODWATCH_SMTP_HOST
- FOODWATCH_SMTP_PORT
- FOODWATCH_SMTP_USER
- FOODWATCH_SMTP_PASS
- FOODWATCH_NOTIFY_FROM
- FOODWATCH_NOTIFY_TO

**After fixing:**
- These variables should ONLY exist as secrets (managed via `firebase functions:secrets:set`)
- Deploy: `npm run deploy:functions`
