# Android Signing Contract

## Purpose

This is the canonical Android signing standard for projects created from this engineering template.

It applies to:

- native Android apps built with Kotlin/Java and Gradle;
- React Native Android apps;
- Flutter Android apps;
- APK and Android App Bundle (AAB) release pipelines.

The goal is to standardize **process, secret names, validation, and recovery**, not to reuse the same private key or password across products.

## Non-negotiable rules

1. **Never ship a production APK/AAB signed with a debug key.**
2. **Never commit a release/upload keystore or signing password.**
3. **Use a unique release/upload key per Android application by default.**
4. **Do not standardize actual release password values across apps.**
5. **Standardize secret/property names across stacks.**
6. **Release signing must fail closed when required inputs are missing.**
7. **Verify the final artifact's signing state before release.**
8. **Keep signing/release approval human-gated.**

Reusing a signing identity across multiple apps is an exception, not the default. It requires an explicit product/security reason and owner approval because it increases the blast radius of compromise.

## Key model

### Debug key

Debug signing exists only for development/testing.

Use the Android/Gradle framework default debug signing behavior unless the project has a documented reason to do otherwise.

Common Android debug defaults use:

- alias: `androiddebugkey`;
- keystore password: `android`;
- key password: `android`.

These values are public conventions and are **not production secrets**.

A project may use a generated or project-local debug keystore when the framework expects one. Do not create one organization-wide debug private key for unrelated products merely for consistency; standardize the debug convention, not shared key bytes. The debug key must never be configured as the signing key for a production/release build.

### Release / upload key

Every app should have its own upload keystore/private key.

For Google Play with Play App Signing:

- the **upload key** signs the AAB/APK submitted to Play;
- Google Play verifies the upload certificate;
- Google manages the **app signing key** used to sign APKs delivered to users.

Where supported, keep the upload key and app signing key separate.

For distribution outside Google Play, the private key used by the project may itself be the long-lived app signing identity. Recovery/backups are therefore even more critical.

The canonical `ANDROID_UPLOAD_*` names are retained across stacks for consistency. Outside Play App Signing, the key behind those names may function as the actual release/app signing key; the word `UPLOAD` does **not** make that key lower-sensitivity.

## Canonical variable and secret names

Use these names consistently in Flutter, React Native, and native Android/Kotlin projects:

```text
ANDROID_UPLOAD_STORE_FILE
ANDROID_UPLOAD_STORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
```

For CI systems that must reconstruct the keystore from a secret value, also use:

```text
ANDROID_UPLOAD_KEYSTORE_BASE64
```

### Meaning

| Name | Secret? | Purpose |
|---|---:|---|
| `ANDROID_UPLOAD_STORE_FILE` | No | Runtime/local path to the temporary or local keystore |
| `ANDROID_UPLOAD_STORE_PASSWORD` | Yes | Keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | No (config) | Alias of the upload/release key |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Yes | Private-key password |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Yes | Base64-encoded keystore bytes for CI transport |

**Base64 is not encryption.** Treat `ANDROID_UPLOAD_KEYSTORE_BASE64` exactly like the binary keystore.

For new greenfield apps, the preferred alias is `upload` unless the distribution/key-custody model requires something else. Brownfield apps must preserve their existing alias unless a reviewed migration is necessary.

Do not standardize actual password values. Generate app-specific, high-entropy values with an approved password manager/secret generator and keep them in approved secret storage.

## Local developer configuration

Use an ignored `key.properties` located at the Android Gradle root:

- native Android: typically `key.properties` at the project Gradle root;
- React Native: typically `android/key.properties`;
- Flutter: typically `android/key.properties`.

Example:

```properties
ANDROID_UPLOAD_STORE_FILE=/secure/path/myapp-upload.jks
ANDROID_UPLOAD_STORE_PASSWORD=<local-secret>
ANDROID_UPLOAD_KEY_ALIAS=upload
ANDROID_UPLOAD_KEY_PASSWORD=<local-secret>
```

Requirements:

- the file must be gitignored;
- the keystore path should point outside source control where practical;
- real values must not appear in `.env.example`, docs, tickets, prompts, or logs;
- do not use a committed `gradle.properties` for release secrets;
- user-level or OS keychain/password-manager storage is acceptable when the build can consume it safely.

## Gradle adapter pattern

All three stacks ultimately use Android Gradle signing.

Projects may implement this contract in Groovy or Kotlin DSL.

### Groovy example

```groovy
import java.util.Properties
import java.io.FileInputStream

def signingProperties = new Properties()
def signingPropertiesFile = rootProject.file("key.properties")
if (signingPropertiesFile.exists()) {
    signingProperties.load(new FileInputStream(signingPropertiesFile))
}

def signingValue = { String name ->
    System.getenv(name) ?: signingProperties.getProperty(name)
}

android {
    signingConfigs {
        release {
            def storePath = signingValue("ANDROID_UPLOAD_STORE_FILE")
            if (storePath) {
                storeFile rootProject.file(storePath)
            }
            storePassword signingValue("ANDROID_UPLOAD_STORE_PASSWORD")
            keyAlias signingValue("ANDROID_UPLOAD_KEY_ALIAS")
            keyPassword signingValue("ANDROID_UPLOAD_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### Kotlin DSL example

```kotlin
import java.io.FileInputStream
import java.util.Properties

val signingProperties = Properties()
val signingPropertiesFile = rootProject.file("key.properties")
if (signingPropertiesFile.exists()) {
    FileInputStream(signingPropertiesFile).use { input ->
    signingProperties.load(input)
}
}

fun signingValue(name: String): String? =
    System.getenv(name) ?: signingProperties.getProperty(name)

android {
    signingConfigs {
        create("release") {
            signingValue("ANDROID_UPLOAD_STORE_FILE")?.let {
                storeFile = rootProject.file(it)
            }
            storePassword = signingValue("ANDROID_UPLOAD_STORE_PASSWORD")
            keyAlias = signingValue("ANDROID_UPLOAD_KEY_ALIAS")
            keyPassword = signingValue("ANDROID_UPLOAD_KEY_PASSWORD")
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

These examples define the adapter only. Projects must additionally implement release-task/CI preflight so missing signing inputs cannot silently produce an unsigned or debug-signed production artifact.

## Stack-specific build commands

### Native Android / Kotlin

Typical release bundle:

```bash
./gradlew bundleRelease
```

Typical release APK:

```bash
./gradlew assembleRelease
```

### React Native

Preferred project command if supported by the current React Native version:

```bash
npx react-native build-android --mode=release
```

The underlying Gradle bundle task can also be invoked directly:

```bash
cd android
./gradlew bundleRelease
```

### Flutter

```bash
flutter build appbundle --release
```

For APK distribution:

```bash
flutter build apk --release
```

## CI signing contract

A release pipeline must check all required signing values **before** starting a production release build.

Always require:

```text
ANDROID_UPLOAD_STORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
```

The keystore itself must come from one approved secret source:

1. `ANDROID_UPLOAD_KEYSTORE_BASE64`, reconstructed into a temporary runner path; or
2. an approved external secret/file provider that materializes the keystore and sets `ANDROID_UPLOAD_STORE_FILE`.

CI must fail if neither source provides usable key material.

The GitHub Actions example below uses the Base64 transport option and exports the reconstructed path as `ANDROID_UPLOAD_STORE_FILE`.

Example for an Ubuntu GitHub Actions runner:

```bash
set -euo pipefail
umask 077

: "${ANDROID_UPLOAD_KEYSTORE_BASE64:?missing Android upload keystore}"
: "${ANDROID_UPLOAD_STORE_PASSWORD:?missing Android keystore password}"
: "${ANDROID_UPLOAD_KEY_ALIAS:?missing Android upload key alias}"
: "${ANDROID_UPLOAD_KEY_PASSWORD:?missing Android upload key password}"

KEYSTORE_PATH="${RUNNER_TEMP}/android-upload-keystore.jks"
printf '%s' "$ANDROID_UPLOAD_KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE_PATH"
echo "ANDROID_UPLOAD_STORE_FILE=$KEYSTORE_PATH" >> "$GITHUB_ENV"
```

Never print the decoded keystore, passwords, or full secret environment.

Remove temporary key material after the signing job where the runner lifecycle does not already guarantee disposal.

## GitHub secret convention

For repositories using GitHub Actions with the Base64 transport pattern, use these repository/environment names:

```text
Secrets:
ANDROID_UPLOAD_KEYSTORE_BASE64
ANDROID_UPLOAD_STORE_PASSWORD
ANDROID_UPLOAD_KEY_PASSWORD

Variable/config:
ANDROID_UPLOAD_KEY_ALIAS
```

For new greenfield apps, `ANDROID_UPLOAD_KEY_ALIAS` may default to `upload`. It may still be stored as a secret if the repository's automation convention keeps all signing inputs together.

Projects using an approved external secret/file provider may omit `ANDROID_UPLOAD_KEYSTORE_BASE64` only when that provider securely materializes the keystore and supplies `ANDROID_UPLOAD_STORE_FILE`.

Do not put the binary keystore directly in Git.

If production signing is environment-protected, bind these secrets to the protected production/release environment and retain the human approval gate.

## Fail-closed release behavior

Projects must prevent all of these:

- release build silently using `signingConfigs.debug`;
- missing release credentials causing a debug-signed artifact;
- unsigned AAB/APK being published as a production candidate;
- CI falling back to placeholder credentials;
- release scripts generating a new signing key automatically because the expected key is missing.

The release pipeline should fail before artifact publication when signing requirements are not satisfied.

## Artifact verification

### AAB

AABs are JAR-signature based. Verify a release bundle with:

```bash
jarsigner -verify -verbose -certs app-release.aab
```

For Google Play uploads, confirm the certificate corresponds to the registered upload certificate.

### APK

Use Android Build Tools:

```bash
apksigner verify --verbose app-release.apk
```

When certificate identity matters, inspect it with:

```bash
apksigner verify --print-certs app-release.apk
```

### Gradle signing report

For configured variants:

```bash
./gradlew signingReport
```

A release gate should record the expected certificate fingerprint out-of-band and compare it where practical.

Do not store private key material in the release record. Public certificate fingerprints are acceptable release metadata.

## Google Play App Signing

For Google Play distribution:

1. generate an app-specific upload key;
2. sign the upload AAB/APK with that upload key;
3. configure/verify Play App Signing according to current Google Play requirements;
4. register/verify the upload certificate in Play Console;
5. record the expected upload certificate fingerprint;
6. use the same approved upload identity for future uploads unless a controlled reset/rotation occurs.

Google Play can manage the app signing key separately from the upload key. Losing or compromising an upload key can be recoverable through Play's upload-key reset process, while loss of a self-managed app signing key outside Play App Signing can prevent future updates.

Always verify current official Android/Google Play documentation at release time.

Official references:

- https://developer.android.com/studio/publish/app-signing
- https://developer.android.com/build/build-variants
- https://developer.android.com/build/building-cmdline

## Key generation

Generate keys using Android Studio or `keytool` according to current Android guidance.

Do not embed a fixed password in a generation script.

A project should record, in a secure operational record:

- app/application ID;
- key purpose: upload vs app signing;
- keystore format;
- key alias;
- public certificate SHA-256 fingerprint;
- creation date;
- owner/custodian;
- backup location;
- recovery/rotation procedure.

The private key and passwords must remain in approved secret storage, not that operational record.

## Backup and recovery

For each production Android app:

- maintain at least one secure backup of the upload/signing key as applicable;
- keep backup access restricted;
- test that the team knows which key belongs to which application ID;
- document Play upload-key reset steps if using Play App Signing;
- document consequences for non-Play/self-managed signing;
- never rotate keys casually just to standardize naming.

## Cross-store distribution

If the same Android application is distributed through multiple stores, decide deliberately whether those channels must share the same app signing identity.

Do not assume Google's managed app signing key is automatically available for another store.

If cross-store identity continuity is required, follow current Android/Google guidance and document the key-custody model before release. Do not assume the Google Play **upload key** is the cross-store app signing identity; the certificate that signs installed APKs is what controls Android update continuity. If the same signing identity must be used across stores, plan that before the first production release and configure Play App Signing accordingly.

## React Native notes

React Native's Android release process uses Gradle, so this contract's canonical property names should replace project-specific names such as `MYAPP_UPLOAD_...` when initializing a new project.

Existing brownfield React Native apps do **not** need a risky signing migration merely to rename variables. Reconcile carefully and preserve the currently registered signing identity. Explicitly inspect the release build type and remove any development placeholder that points release signing at `signingConfigs.debug`.

Official React Native reference:

- https://reactnative.dev/docs/signed-apk-android

## Flutter notes

Flutter's standard Android release guidance uses `android/key.properties`. New Flutter projects should use the canonical names from this contract inside that ignored file and adapt Gradle accordingly.

Existing Flutter apps should preserve the registered key and may migrate only the configuration names, not the signing identity, through a bounded reviewed change.

Official Flutter reference:

- https://docs.flutter.dev/deployment/android

## Native Android / Kotlin notes

Native Android projects may load the same canonical names from a root `key.properties`, environment variables, Gradle properties, or another approved secret provider.

The naming contract is more important than the storage adapter; secret values still stay outside Git.

## Repository hygiene

Projects should ignore the actual release/upload keystore path and private signing material. Example patterns may include:

```gitignore
*upload*.jks
*release*.jks
*upload*.keystore
*release*.keystore
key.properties
android/key.properties
```

These patterns are examples, not a substitute for ignoring the project's real release/upload keystore filename.

Some frameworks or existing projects intentionally carry a **debug-only** keystore with public/default debug credentials. Do not misclassify that as production key material, but verify that the release build never references it.

Do not blindly ignore public certificate files if the project intentionally versions them, but never commit a production private key.

## Release checklist

Before approving an Android production release:

- [ ] application/package ID is correct;
- [ ] release artifact was built from the intended exact commit;
- [ ] no debug signing config is used for release;
- [ ] expected release/upload key is configured;
- [ ] signing secrets came from approved secret storage;
- [ ] AAB/APK signature verification passed;
- [ ] expected public certificate fingerprint matches;
- [ ] Google Play App Signing/upload certificate is correct when applicable;
- [ ] version/build number is correct;
- [ ] release artifact is traceable;
- [ ] human production-release approval has been recorded.

## Brownfield rule

Never replace an existing production signing identity solely to conform to this template.

For an existing app:

1. identify the current signing/upload key and registered certificate;
2. determine whether Play App Signing is enabled;
3. preserve update continuity;
4. normalize secret/property names only if safe;
5. add missing backup/recovery and CI validation;
6. independently review any signing migration;
7. require explicit owner approval before rotating or replacing a production key.

**Standardize the signing contract, not the private key material.**
