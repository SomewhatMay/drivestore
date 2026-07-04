# Getting a Google Drive access token

`drivestore` authenticates with a Google OAuth access token that carries the
`https://www.googleapis.com/auth/drive.appdata` scope. This guide walks through
getting one, so you can try the library or run the integration tests.

You'll need a Google account. Everything here is free. The token you end up with
is valid for about an hour; when it expires, redo Step 7 for a fresh one.

## 1. Create a project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown in the top bar, then **New Project**.
3. Name it (for example, `drivestore-dev`) and click **Create**.
4. Select the new project in the dropdown once it's ready.

## 2. Enable the Google Drive API

1. Search for **Google Drive API** in the top search bar.
2. Open it and click **Enable**.

## 3. Set up the consent screen

1. Search for **OAuth consent screen**, open it, and click **Get started**.
2. Enter an **App name**, pick your email as the **User support email**, and click **Next**.
3. Choose **External** for the audience, then **Next**.
4. Enter your email under contact information, then **Next**.
5. Agree to the policy and click **Create**.

## 4. Add the drive.appdata scope

1. Open **Data access** under Google Auth Platform.
2. Click **Add or remove scopes**.
3. Filter for `drive.appdata` and tick the `.../auth/drive.appdata` scope.
4. Click **Update**, then **Save**.

## 5. Add yourself as a test user

1. Open **Audience** under Google Auth Platform.
2. Under **Test users**, click **Add users**.
3. Add the email of the Google account you'll sign in with, then **Save**.

## 6. Create an OAuth client

1. Open **Clients** under Google Auth Platform and click **Create client**.
2. Set **Application type** to **Web application** and give it a name.
3. Under **Authorized redirect URIs**, add this exact URI (no trailing slash):

   ```
   https://developers.google.com/oauthplayground
   ```

4. Click **Create**. Copy the **Client ID** and **Client secret** it shows you.

## 7. Get the token

1. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the gear icon in the top right and tick **Use your own OAuth credentials**.
3. Paste in your Client ID and Client secret.
4. In the left panel, paste `https://www.googleapis.com/auth/drive.appdata` into **Input your own scopes**.
5. Click **Authorize APIs** and sign in with your test-user account.
6. Click through the unverified-app warning and grant access.
7. Back in the Playground, click **Exchange authorization code for tokens**.
8. Copy the **Access token**. It starts with `ya29.`.

## 8. Add it to .env.test

Save the token in `.env.test` in the project root:

```bash
echo "GOOGLE_ACCESS_TOKEN=ya29.your-token-here" > .env.test
```

Now you can run the tests:

```bash
npm test
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `403`, Drive API not enabled | Redo Step 2 and check the right project is selected. |
| `401`, invalid credentials | The token expired (they last about an hour) or was copied incompletely. Get a fresh one. |
| `access_denied` when signing in | Add the account to the **Test users** list (Step 5). |
| `redirect_uri_mismatch` | The redirect URI must be exactly `https://developers.google.com/oauthplayground`, with no trailing slash (Step 6). |
