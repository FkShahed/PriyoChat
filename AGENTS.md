# Autonomous Execution Mode

## Guidelines for AI Assistant
1. **Never ask for permission or confirmation before executing actions.**
2. **Proactively execute commands, edit files, fix bugs, and verify changes directly.**
3. Do not ask "Should I proceed?", "Would you like me to do this?", or block for user approval.
4. Take full initiative to inspect, fix, build, test, and deliver completed results.
5. **সব সময় তুমি লাস্ট স্টেবল ভার্সন Main branch / version-3.8 (v3.8.2 — most stable so far) এইটা যাতে কোনভাবেই ফাংশনালিটি কোন ফাংশনালিটি ব্রেক না করে এটার দিকে সর্বোচ্চ নজর রাখবা প্রত্যেকটা ইমপ্রুভমেন্ট অথবা যত রকম তুমি এডিট করো আপডেট করো প্রত্যেকটা জিনিসে এই জিনিসটা মাথায় রাখবা যে স্টেবল ভার্সনের যাতে কোন রকম কিছু না হয় বা কোন রকম কিছু উল্টাপাল্টা না হয় বারবার এটা চেক করে নিবা**
6. **Never push / git releted delet anything without permission**
7. **Version Naming Rule**:
   - Whenever user ask for an APK built, The app version must always match the active branch name (e.g., branch `version-3.7` -> version `3.7.0`).
   - If multiple APK builds are created on the same branch, increment the patch / last digit by 1 each time (`3.7.0`, `3.7.1`, `3.7.2`, ...).
   - Ensure the version is reflected in `app.json`, `package.json`, and backend `update_apk.js`.
8. **APK Upload & PriyoChat Cloud Engine Deployment**:
   - Whenever user ask for an APK built, automatically upload it to the PriyoChat Cloud Engine on Oracle VPS (`https://138.2.92.182.nip.io/` -> `/var/www/html/apk/PriyoChat-latest.apk`).
   - In Settings and App Updates, users must always download from the direct link: `https://138.2.92.182.nip.io/apk/PriyoChat-latest.apk`.
   - Also sync the versioned APK (e.g. `PriyoChat-v3.7.0.apk`) and publish the updated version record to MongoDB via `update_apk.js`.
