# Firebase / Firestore setup

The current project configuration is already in `firebase-config.js`. The steps below are useful for a new Firebase project or to finish configuring this one.

1. Go to the [Firebase console](https://console.firebase.google.com/) and create/select a project.
2. In **Project overview**, click the web icon (`</>`), register a web app, and copy its Firebase configuration object.
3. Paste the configuration into `firebase-config.js`, replacing the existing `firebaseConfig` object. Keep the `export const firebaseConfig = ...` form.
4. Open **Build → Firestore Database**, select **Create database**, choose a region, and enable Firestore.
5. Open **Build → Authentication → Sign-in method**, enable **Google**, and add your GitHub Pages hostname to **Authentication → Settings → Authorized domains**.
6. In the **Firestore Database → Rules** tab, publish private per-user rules:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/notes/{noteId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

The legacy top-level `notes` collection is read only during the optional one-time import. To permit that import temporarily, add this rule while importing, then remove it when every user has migrated:

```text
match /notes/{noteId} {
  allow read: if request.auth != null;
}
```
