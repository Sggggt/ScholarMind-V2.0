# Mobile APK Docker Build

This project can build the Android release APK inside a Linux Docker container.

## Command

From the repository root:

```powershell
docker compose run --build --rm --profile mobile mobile-apk
```

## Output

The APK is exported to:

```text
tmp/mobile-apk-out/scholarmind-mobile-release.apk
```

## What the container does

1. Builds on Ubuntu 24.04.
2. Installs OpenJDK 21, Node.js 20, `pnpm`, and Android SDK command-line tools.
3. Runs `pnpm install`.
4. Runs `pnpm exec expo prebuild -p android --clean`.
5. Runs `./gradlew app:assembleRelease`.

## Notes

- The container rebuilds the generated `android/` folder each time, so old Windows-generated native artifacts are not reused.
- This flow is intended to avoid WSL-specific network problems during Gradle and Android dependency resolution.
- The current Android release config still uses the project's existing signing setup. If you need a production-distribution APK, replace the debug-style signing config in `mobile/android/app/build.gradle` after prebuild configuration is stabilized.
