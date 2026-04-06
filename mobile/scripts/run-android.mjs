import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function ensureDir(target) {
  if (path.resolve(target) === path.parse(path.resolve(target)).root) {
    return;
  }
  fs.mkdirSync(target, { recursive: true });
}

function ensureJunction(linkPath, targetPath) {
  try {
    const stats = fs.lstatSync(linkPath);
    if (stats.isSymbolicLink()) {
      const resolved = fs.realpathSync.native(linkPath);
      if (path.resolve(resolved) === path.resolve(targetPath)) {
        return;
      }
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch {}

  fs.symlinkSync(targetPath, linkPath, "junction");
}

function updateFileIfChanged(filePath, updater) {
  const original = fs.readFileSync(filePath, "utf8");
  const next = updater(original);
  if (next !== original) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}

function upsertGradleProperty(source, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedKey}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(source)) {
    return source.replace(pattern, line);
  }
  return source.endsWith("\n") ? `${source}${line}\n` : `${source}\n${line}\n`;
}

function removeGradleProperty(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedKey}=.*(?:\\r?\\n)?`, "gm");
  return source.replace(pattern, "");
}

function patchReactNativeZeroconf() {
  const buildGradlePath = path.join(
    projectRoot,
    "node_modules",
    "react-native-zeroconf",
    "android",
    "build.gradle"
  );

  updateFileIfChanged(buildGradlePath, (source) => {
    let next = source;

    if (!next.includes("def resolveJniFile(fileName)")) {
      const marker =
        "def safeExtGet(prop, fallback) {\n    rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback\n}\n";
      const injected =
        `${marker}\n` +
        "def resolveJniFile(fileName) {\n" +
        "    def overrideDir = System.getenv('ZEROCONF_NDK_DIR')\n" +
        "    if (overrideDir) {\n" +
        "        return new File(overrideDir, fileName)\n" +
        "    }\n" +
        '    return file("src/main/jni/${fileName}")\n' +
        "}\n\n" +
        "def overrideBuildDir = System.getenv('ZEROCONF_BUILD_DIR')\n" +
        "if (overrideBuildDir) {\n" +
        "    buildDir = file(overrideBuildDir)\n" +
        "}\n";
      next = next.replace(marker, injected);
    }

    next = next.replace(
      'arguments "NDK_APPLICATION_MK:=src/main/jni/Application.mk"',
      `arguments "NDK_APPLICATION_MK:=\${resolveJniFile('Application.mk').absolutePath}"`
    );
    next = next.replace('path "src/main/jni/Android.mk"', 'path resolveJniFile("Android.mk")');

    return next;
  });
}

function patchReactNativeGradlePlugin() {
  const settingsPath = path.join(
    projectRoot,
    "node_modules",
    "@react-native",
    "gradle-plugin",
    "settings.gradle.kts"
  );

  updateFileIfChanged(settingsPath, (source) => {
    let next = source;
    next = next.replace(
      'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }\n\n',
      ""
    );

    const defaultRepos =
      "  repositories {\n    mavenCentral()\n    google()\n    gradlePluginPortal()\n  }\n";
    const patchedRepos =
      '  repositories {\n' +
      '    maven("https://maven.aliyun.com/repository/gradle-plugin")\n' +
      '    maven("https://maven.aliyun.com/repository/google")\n' +
      '    maven("https://maven.aliyun.com/repository/public")\n' +
      "    mavenCentral()\n" +
      "    google()\n" +
      "    gradlePluginPortal()\n" +
      "  }\n";

    if (!next.includes('maven("https://maven.aliyun.com/repository/gradle-plugin")')) {
      next = next.replace(defaultRepos, patchedRepos);
    }

    return next;
  });

  const targetToolchainVersion = detectJavaMajor("C:\\Java\\microsoft-jdk-17") >= 17 ? 17 : 21;

  const toolchainFiles = [
    path.join(projectRoot, "node_modules", "@react-native", "gradle-plugin", "settings-plugin", "build.gradle.kts"),
    path.join(projectRoot, "node_modules", "@react-native", "gradle-plugin", "react-native-gradle-plugin", "build.gradle.kts"),
    path.join(projectRoot, "node_modules", "@react-native", "gradle-plugin", "shared", "build.gradle.kts"),
    path.join(projectRoot, "node_modules", "@react-native", "gradle-plugin", "shared-testutil", "build.gradle.kts"),
  ];

  for (const filePath of toolchainFiles) {
    updateFileIfChanged(filePath, (source) =>
      source.replace(/jvmToolchain\((17|21)\)/g, `jvmToolchain(${targetToolchainVersion})`)
    );
  }

  const jdkConfiguratorPath = path.join(
    projectRoot,
    "node_modules",
    "@react-native",
    "gradle-plugin",
    "react-native-gradle-plugin",
    "src",
    "main",
    "kotlin",
    "com",
    "facebook",
    "react",
    "utils",
    "JdkConfiguratorUtils.kt"
  );

  updateFileIfChanged(jdkConfiguratorPath, (source) =>
    source.replace(/jvmToolchain\((17|21)\)/g, `jvmToolchain(${targetToolchainVersion})`)
  );
}

function configureGradleJava(androidDir, javaHome) {
  if (!javaHome) return;

  const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
  const normalizedJavaHome = javaHome.replace(/\\/g, "\\\\");

  updateFileIfChanged(gradlePropertiesPath, (source) => {
    let next = source;
    next = upsertGradleProperty(next, "org.gradle.java.home", normalizedJavaHome);
    next = removeGradleProperty(next, "org.gradle.java.installations.auto-detect");
    next = removeGradleProperty(next, "org.gradle.java.installations.paths");
    return next;
  });
}

function detectJavaMajor(javaHome) {
  if (!javaHome) return 0;
  const javaExe = path.join(javaHome, "bin", "java.exe");
  if (!fs.existsSync(javaExe)) return 0;

  const result = spawnSync(javaExe, ["-version"], {
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/version "(?<version>\d+(?:\.\d+)?)/);
  if (!match?.groups?.version) return 0;

  const version = match.groups.version;
  if (version.startsWith("1.")) {
    return Number(version.split(".")[1] ?? 0);
  }
  return Number(version.split(".")[0] ?? 0);
}

function detectJavaHome() {
  const currentJavaHome = process.env.JAVA_HOME;
  if (currentJavaHome && detectJavaMajor(currentJavaHome) >= 11) {
    return currentJavaHome;
  }

  const candidates = [
    "C:\\Java\\microsoft-jdk-17",
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    "C:\\Program Files\\Android\\Android Studio\\jre",
    "C:\\Program Files\\Java\\latest",
  ];

  const preferred = candidates.find((candidate) => detectJavaMajor(candidate) >= 17);
  return preferred ?? currentJavaHome;
}

function getWindowsPathKey(env) {
  const key = Object.keys(env).find((item) => item.toLowerCase() === "path");
  return key ?? "Path";
}

function prependWindowsPath(env, entry) {
  const pathKey = getWindowsPathKey(env);
  const currentPath = env[pathKey] ?? "";
  env[pathKey] = currentPath ? `${entry};${currentPath}` : entry;

  if (pathKey !== "PATH") {
    delete env.PATH;
  }
}

function resolveWindowsCmd(env) {
  const candidates = [
    env.ComSpec,
    process.env.ComSpec,
    env.SystemRoot ? path.join(env.SystemRoot, "System32", "cmd.exe") : null,
    process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "cmd.exe") : null,
    "C:\\Windows\\System32\\cmd.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "cmd.exe";
}

function runGradle(androidDir, gradleArgs, env) {
  if (!fs.existsSync(androidDir)) {
    console.error(`[run-android] Android directory not found: ${androidDir}`);
    process.exit(1);
  }

  const gradlewPath = path.join(androidDir, "gradlew.bat");
  if (!fs.existsSync(gradlewPath)) {
    console.error(`[run-android] Gradle wrapper not found: ${gradlewPath}`);
    process.exit(1);
  }

  const cmdPath = resolveWindowsCmd(env);
  const result = spawnSync(cmdPath, ["/c", "gradlew.bat", ...gradleArgs], {
    cwd: androidDir,
    stdio: "inherit",
    env,
  });

  if (result.error) {
    console.error(`[run-android] Failed to start Gradle: ${result.error.message}`);
    if (result.error.code) {
      console.error(`[run-android] Spawn error code: ${result.error.code}`);
    }
    process.exit(1);
  }

  if (result.signal) {
    console.error(`[run-android] Gradle terminated by signal: ${result.signal}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`[run-android] Gradle exited with code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

function runAndroid() {
  patchReactNativeZeroconf();
  patchReactNativeGradlePlugin();

  const extraArgs = process.argv.slice(2);
  const variantIndex = extraArgs.findIndex((arg) => arg === "--variant" || arg.startsWith("--variant="));
  let variantName = "debug";
  if (variantIndex >= 0) {
    const arg = extraArgs[variantIndex];
    if (arg.startsWith("--variant=")) {
      variantName = arg.split("=")[1] || variantName;
    } else if (extraArgs[variantIndex + 1]) {
      variantName = extraArgs[variantIndex + 1];
    }
  }
  if (process.platform !== "win32") {
    const result = spawnSync(
      "node",
      [path.join(projectRoot, "node_modules", "expo", "bin", "cli"), "run:android", ...extraArgs],
      {
        cwd: projectRoot,
        stdio: "inherit",
        env: process.env,
      }
    );
    process.exit(result.status ?? 1);
  }

  if (extraArgs.includes("--help") || extraArgs.includes("-h")) {
    const result = spawnSync(
      "node",
      [path.join(projectRoot, "node_modules", "expo", "bin", "cli"), "run:android", ...extraArgs],
      {
        cwd: projectRoot,
        stdio: "inherit",
        env: process.env,
      }
    );
    process.exit(result.status ?? 1);
  }

  const projectLink = process.env.SCHOLARMIND_ANDROID_PROJECT_LINK ?? "C:\\smobile";
  const jniLink = process.env.SCHOLARMIND_ANDROID_JNI_LINK ?? "C:\\rnzc-jni";
  const buildDir =
    process.env.SCHOLARMIND_ANDROID_ZEROCONF_BUILD_DIR ??
    `C:\\rnzc-build-${variantName.toLowerCase()}`;
  const tempDir = process.env.SCHOLARMIND_ANDROID_TEMP_DIR ?? "C:\\Windows\\Temp";
  const homeDir = process.env.SCHOLARMIND_ANDROID_HOME_DIR ?? "C:\\temp-user";
  const gradleDir = process.env.SCHOLARMIND_ANDROID_GRADLE_HOME ?? "C:\\gradle-cache";

  ensureDir(path.dirname(projectLink));
  fs.rmSync(buildDir, { recursive: true, force: true });
  ensureDir(buildDir);
  ensureDir(tempDir);
  ensureDir(homeDir);
  ensureDir(gradleDir);

  ensureJunction(projectLink, projectRoot);
  ensureJunction(
    jniLink,
    path.join(projectRoot, "node_modules", "react-native-zeroconf", "android", "src", "main", "jni")
  );

  const javaHome = detectJavaHome();
  const env = {
    ...process.env,
    GRADLE_USER_HOME: gradleDir,
    TEMP: tempDir,
    TMP: tempDir,
    USERPROFILE: homeDir,
    HOME: homeDir,
    ZEROCONF_NDK_DIR: jniLink,
    ZEROCONF_BUILD_DIR: buildDir,
    NODE_ENV: process.env.NODE_ENV ?? "development",
  };

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    env.ORG_GRADLE_JAVA_HOME = javaHome;
    prependWindowsPath(env, path.join(javaHome, "bin"));
  }

  configureGradleJava(path.join(projectRoot, "android"), javaHome);

  if (javaHome) {
    console.log(`[run-android] Using JAVA_HOME=${javaHome}`);
  } else {
    console.warn("[run-android] JAVA_HOME not found. Gradle may fail if only Java 8 is available.");
  }

  const androidDir = path.join(projectLink, "android");
  const noBundler = extraArgs.includes("--no-bundler");
  const gradleTask = `app:assemble${variantName.charAt(0).toUpperCase()}${variantName.slice(1)}`;
  const gradleArgs = [
    gradleTask,
    "-x",
    "lint",
    "-x",
    "test",
    "--configure-on-demand",
    "--build-cache",
    "-PreactNativeDevServerPort=8081",
    "-PreactNativeArchitectures=x86_64,arm64-v8a",
  ];

  if (!noBundler) {
    const metro = spawn("pnpm", ["dev:metro"], {
      cwd: projectRoot,
      env,
      detached: true,
      stdio: "ignore",
      shell: true,
    });
    metro.unref();
    console.log("[run-android] Started Metro in the background with `pnpm dev:metro`.");
  }

  runGradle(androidDir, gradleArgs, env);

  const appBuildGradle = fs.readFileSync(path.join(projectRoot, "android", "app", "build.gradle"), "utf8");
  const appIdMatch =
    appBuildGradle.match(/applicationId\s+['"]([^'"]+)['"]/) ??
    appBuildGradle.match(/applicationId\s*=\s*['"]([^'"]+)['"]/);
  const applicationId = appIdMatch?.[1];

  const sdkRoot =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    (fs.existsSync("C:\\Android\\Sdk") ? "C:\\Android\\Sdk" : null);
  const adbPath = sdkRoot ? path.join(sdkRoot, "platform-tools", "adb.exe") : null;

  if (adbPath && applicationId && fs.existsSync(adbPath)) {
    const apkPath = path.join(
      projectRoot,
      "android",
      "app",
      "build",
      "outputs",
      "apk",
      variantName.toLowerCase(),
      `app-${variantName.toLowerCase()}.apk`
    );

    if (fs.existsSync(apkPath)) {
      const install = spawnSync(adbPath, ["install", "-r", apkPath], {
        stdio: "inherit",
        env,
      });
      if ((install.status ?? 1) === 0) {
        spawnSync(
          adbPath,
          ["shell", "monkey", "-p", applicationId, "-c", "android.intent.category.LAUNCHER", "1"],
          {
            stdio: "inherit",
            env,
          }
        );
      }
    } else {
      console.warn(`[run-android] APK not found at ${apkPath}`);
    }
  } else {
    console.warn("[run-android] App installed. Start it manually on the device if it did not launch automatically.");
  }

  process.exit(0);
}

runAndroid();
