# Pickleball Club Manager — phone-first source starter

This is a private, multi-user Progressive Web App (PWA) starter using Firebase Authentication and Cloud Firestore.

## Important
- This is a starter project, not a finished audited production system.
- The first registered club organizer creates a club. Members request access using the club ID; the organizer approves them.
- The app is hosted as a web app and can be installed from Chrome on Android.
- Club members share the same Firestore session state.
- The Firestore rules in `firestore.rules` are a starter baseline. Review and test them before using real club data.
- Do not publish Firebase service-account keys or admin credentials in frontend code.

## 1. Create Firebase project
1. Open https://console.firebase.google.com/ and create a project.
2. Add a Web App and copy its Firebase configuration.
3. In Authentication > Sign-in method, enable Email/Password.
4. In Firestore Database, create a database.
5. Open Firestore Rules and replace the rules with `firestore.rules`, then publish.
6. In `app.js`, replace all `PASTE_...` values in `firebaseConfig` with the web app config values.

## 2. Create the web project in Replit
1. Open https://replit.com/ in Chrome or the Replit Android app.
2. Create a new HTML/CSS/JS project.
3. Upload/copy the files from this ZIP into the project root:
   `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `icon.svg`.
4. Set the run command to serve the static site. If prompted, use a static web server or `npx serve . -l 3000`.
5. Preview and test registration, club creation, member join request, organizer approval, and live scoring.
6. Publish/deploy the web app. Use the HTTPS public URL.

## 3. Install on Android
1. Open the deployed HTTPS URL in Chrome on Android.
2. Sign in and create your club.
3. Use Chrome menu > Install app or Add to Home screen.
4. Share the club ID with members. They create their own accounts, request access, and wait for approval.
5. Members open the same URL and install it the same way.

## 4. Test before club use
- Use at least two phones and two separate accounts.
- Confirm member requests cannot access session data before approval.
- Confirm both phones see score changes.
- Test FIFO with uneven player counts and multiple courts.
- Test traditional side-out and rally scoring against official rules.
- Export or back up data before each session.

## 5. Known MVP limitations to fix before production
- This version uses a shared live-state document. Simultaneous score taps from multiple devices can conflict; designate one scorekeeper per court or add transaction-based event logging.
- Traditional scoring is simplified and does not yet enforce all service-position, player-position, fault, and server rotation rules.
- Partner balancing evaluates the three possible pairings on each court, but does not globally optimize all courts together.
- Offline support caches the app shell only; live club actions require internet.
- Add rate limits, stronger admin management, account recovery, audit logs, and formal security review before wider use.
- Firestore costs and quotas depend on usage and current Firebase plan.

## Useful official docs
- Firebase Hosting: https://firebase.google.com/docs/hosting/
- Firebase Authentication: https://firebase.google.com/docs/auth
- Firestore security rules: https://firebase.google.com/docs/firestore/security/get-started
- Replit mobile: https://replit.com/mobile
- PWA install: https://web.dev/learn/pwa/installation/
