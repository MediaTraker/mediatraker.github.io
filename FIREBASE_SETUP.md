# Firebase / Firestore setup

The current project configuration is already in `firebase-config.js`. The steps below are useful for a new Firebase project or to finish configuring this one.

1. Go to the [Firebase console](https://console.firebase.google.com/) and create/select a project.
2. In **Project overview**, click the web icon (`</>`), register a web app, and copy its Firebase configuration object.
3. Paste the configuration into `firebase-config.js`, replacing the existing `firebaseConfig` object. Keep the `export const firebaseConfig = ...` form.
4. Open **Build → Firestore Database**, select **Create database**, choose a region, and enable Firestore.
5. In the **Rules** tab, publish rules appropriate to how the catalog is shared:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read, write: if true;
    }
  }
}
```

These rules allow anyone who knows the site URL to read and change the shared catalog. They are suitable only for a small trusted personal catalog. For a public site, add Firebase Authentication and restrict the rules to signed-in users before publishing.
