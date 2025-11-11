# --- Email/SMTP configuration (Gmail) ---
# For Gmail, you need to use an App Password (not your regular password)
# Generate one at: https://myaccount.google.com/apppasswords
# Steps:
# 1. Enable 2-Step Verification on your Google account
# 2. Go to https://myaccount.google.com/apppasswords
# 3. Generate an app password for "Mail" and "Other (Custom name)" -> "Foodsharing Watcher"
# 4. Use the 16-character password (no spaces) as FOODWATCH_SMTP_PASS
FOODWATCH_SMTP_HOST=smtp.gmail.com
FOODWATCH_SMTP_PORT=587
FOODWATCH_SMTP_USER=alexandr.stoian@gmail.com
FOODWATCH_SMTP_PASS=YOUR_GMAIL_APP_PASSWORD_HERE

# Sender and recipient email for notifications
FOODWATCH_NOTIFY_FROM=alexandr.stoian@gmail.com
FOODWATCH_NOTIFY_TO=alexandr.stoian@gmail.com

# --- Login for foodsharing.de ---
FOODWATCH_LOGIN_EMAIL=alexandr.stoian@gmail.com
FOODWATCH_LOGIN_PASSWORD=
