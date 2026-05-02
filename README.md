![Banner](banner.png)

> A tiny, typed TypeScript library that turns Google Drive's **appDataFolder** into a simple path-based file store.

[![npm version](https://img.shields.io/npm/v/drivestore.svg?style=flat-square)](https://www.npmjs.com/package/drivestore)
[![license](https://img.shields.io/github/license/somewhatmay/drivestore?style=flat-square)](./LICENSE)
[![types](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

```ts
const store = createDriveStore({ accessToken });

await store.write("config/settings.json", JSON.stringify({ theme: "dark" }));
const settings = await store.read("config/settings.json");
```

---

## Why?

Google Drive's `appDataFolder` is a hidden, per-app storage space that users can't see or accidentally delete. It's perfect for syncing small amounts of app data — preferences, logs, state — across devices without building your own backend.

`drivestore` wraps the Drive REST API in a dead-simple interface: **read, write, append, exists, delete**. No SDKs, no OAuth scaffolding — just bring an access token.

---

## Features

- 📁 **Path-based API** — use familiar `folder/subfolder/file.txt` paths
- 🗂️ **Auto folder creation** — nested folders are created on demand
- ⚡ **Folder ID caching** — repeated writes to the same directory skip redundant API calls
- 🛡️ **Typed errors** — `DriveError` carries `.status` and `.body` so you can branch on 404 vs 401
- 🔑 **Flexible auth** — pass a static token string or an async function that refreshes it
- 🪶 **Zero dependencies** — uses the native `fetch` API

---

## Installation

```bash
npm install drivestore
# or
pnpm add drivestore
# or
yarn add drivestore
```

Requires **Node 18+** (or any runtime with `fetch` built in).

---

## Quick start

### 1. Get an access token

You'll need an OAuth 2.0 access token with the `https://www.googleapis.com/auth/drive.appdata` scope. How you obtain it depends on your app:

- **Browser apps** — use [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- **Server apps** — use a service account or the [googleapis](https://github.com/googleapis/google-api-nodejs-client) Node.js client
- **CLIs / local tools** — use `gcloud auth print-access-token` during development

### 2. Create a store

```ts
import { createDriveStore } from "drivestore";

const store = createDriveStore({
  accessToken: "ya29.your-token-here",

  //  namespace all files under this root folder
  rootName: "my-app",
});
```

For long-running processes where tokens expire, pass an async function instead:

```ts
const store = createDriveStore({
  accessToken: () => getAccessToken(), // called before every API request
  rootName: "my-app",
});
```

### 3. Use it

```ts
// Write a file (creates nested folders automatically)
await store.write("users/alice/prefs.json", JSON.stringify({ lang: "en" }));

// Read it back
const raw = await store.read("users/alice/prefs.json");
const prefs = JSON.parse(raw);

// Append to a log
await store.append("logs/2025-01.txt", `${new Date().toISOString()} - login\n`);

// Check existence without throwing
if (await store.exists("users/alice/prefs.json")) {
  // ...
}

// Delete
await store.delete("users/alice/prefs.json");
```

---

## API

### `createDriveStore(options)`

Returns a `DriveStore` instance.

| Option        | Type                              | Default         | Description                                                                       |
| ------------- | --------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| `accessToken` | `string \| () => Promise<string>` | —               | **Required.** OAuth token or async supplier.                                      |
| `rootName`    | `string`                          | `"drive-store"` | Name of the root folder in `appDataFolder`. Useful for namespacing multiple apps. |

---

### `DriveStore`

All methods accept POSIX-style paths (`"a/b/c.txt"`). Leading/trailing slashes and extra whitespace are ignored.

#### `read(path): Promise<string>`

Returns the file contents as a string. Throws `DriveError` with `status: 404` if the file does not exist.

```ts
const content = await store.read("config.json");
```

#### `write(path, content): Promise<void>`

Creates or fully overwrites a file. Intermediate folders are created automatically.

```ts
await store.write("config.json", JSON.stringify(config));
```

#### `append(path, content): Promise<void>`

Appends `content` to an existing file, or creates it if absent. Intermediate folders are created automatically.

> ⚠️ **Not atomic.** Concurrent calls to `append` on the same file may produce interleaved or lost writes. Serialize access in your application if needed.

```ts
await store.append("events.log", `${Date.now()} clicked\n`);
```

#### `exists(path): Promise<boolean>`

Returns `true` if the file exists, `false` otherwise. Never throws for missing files or folders.

```ts
const hasCache = await store.exists("cache/result.json");
```

#### `delete(path): Promise<void>`

Deletes the file. Throws `DriveError` with `status: 404` if the file does not exist.

```ts
await store.delete("cache/result.json");
```

---

### `DriveError`

All Drive API failures throw a `DriveError` instead of a generic `Error`, so you can handle specific cases cleanly.

```ts
import { DriveError } from "drivestore";

try {
  const content = await store.read("maybe/missing.txt");
} catch (err) {
  if (err instanceof DriveError && err.status === 404) {
    // file doesn't exist yet — that's fine
  } else {
    throw err; // re-throw unexpected errors
  }
}
```

| Property  | Type     | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `message` | `string` | Human-readable description including the HTTP status |
| `status`  | `number` | HTTP status code (`404`, `401`, `403`, …)            |
| `body`    | `string` | Raw response body from the Drive API                 |

---

## How it works

All data is stored inside your app's private `appDataFolder` — a special Drive space that:

- Is **invisible** to the user in Drive UI
- Is **scoped to your app** — other apps can't access it
- Is **tied to the user's Google account** — data follows them across devices
- Can be **cleared** by the user via Google Account → Data & Privacy → Delete app data

The folder structure in Drive mirrors the paths you use:

```
appDataFolder/
└── my-app/              ← rootName
    ├── config.json
    └── users/
        └── alice/
            └── prefs.json
```

Folder IDs are cached in memory after the first traversal, so writing `users/alice/a.txt` and `users/alice/b.txt` back-to-back only resolves the `users/alice` chain once.

---

## Running the tests

Tests are written with [Vitest](https://vitest.dev/) and split into unit tests (no network) and integration tests (require a real token).

```bash
# Install dependencies
npm install

# Create a test env file with your token
echo "GOOGLE_ACCESS_TOKEN=ya29.your-token" > .env.test

# Run all tests
npm test

# Run only unit tests (no token needed)
npm test -- --testPathPattern="functions|path"
```

To get a token quickly during development:

```bash
gcloud auth print-access-token
```

---

## Project structure

```
src/
├── types.ts        # DriveFile, DriveError, DriveStore interface
├── drive-api.ts    # Low-level Drive REST wrappers
├── drive-path.ts   # Path utilities and folder resolution
├── drive-store.ts  # createDriveStore factory
├── functions.ts    # Utility functions
└── index.ts        # Public exports

test/
├── auth-permission.test.ts
├── drive-api.test.ts
├── drive-path.test.ts
├── drive-store.test.ts
├── functions.test.ts
├── get-token.ts
└── setup.ts
```

---

## Contributing

Contributions are welcome! Please open an issue before submitting a large pull request so we can discuss the change.

```bash
git clone https://github.com/SomewhatMay/drivestore
cd drive-store
npm install
npm test
```

Please make sure all tests pass and new behaviour is covered by tests before opening a PR.

---

## License

[MIT](./LICENSE) © SomewhatMay
