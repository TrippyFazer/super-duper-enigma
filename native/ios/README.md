# Ascend iOS bridge

The web app cannot read HealthKit. This folder holds the **minimum native layer** needed
to get Apple Health data into it without changing the web architecture.

```
AscendHealthBridge/HealthBridge.swift   read-only HealthKit → POST /api/health/ingest
```

## Fastest path: Capacitor shell

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init Ascend com.yourname.ascend --web-dir=.next-static   # or point server.url at your deployed app
npx cap add ios
open ios/App/App.xcworkspace
```

1. In Xcode: *Signing & Capabilities* → add **HealthKit**.
2. Info.plist: `NSHealthShareUsageDescription` = "Ascend reads steps, sleep, workouts and
   heart data from Apple Health to update your character. Nothing is written."
3. Drag `AscendHealthBridge/HealthBridge.swift` into the App target.
4. In `AppDelegate.application(_:didFinishLaunchingWithOptions:)`:

```swift
HealthBridge.shared.configure(endpoint: URL(string: "https://your-ascend.example")!, token: "<token from Settings → Connected services>")
HealthBridge.shared.start()
```

5. Optional: expose `HealthBridge.shared.syncNow()` to the web view (a Capacitor plugin
   method or `WKScriptMessageHandler`) so the "Sync now" button can trigger a native fetch
   as well as the server-side re-apply.

Set `capacitor.config.json` → `server.url` to your deployed Ascend URL so the shell loads
the live app (offline shell comes from the PWA service worker).

## Behaviour

* Read-only authorization for steps, active energy, distance, exercise minutes, sleep
  analysis, resting HR, heart rate, HRV, body mass, workouts.
* Anchored queries (incremental) + observer queries with hourly background delivery.
* Posts `{ bridge: "native", backgroundDelivery: true, samples, workouts, permissions }`.
* If HealthKit is unavailable or a permission is denied, nothing crashes: the server simply
  never sees samples for that metric and shows "—".

## No-code alternative

See `docs/apple-health.md` → "Option A — iOS Shortcut". Same endpoint, same payload,
scheduled by a Shortcuts automation instead of background delivery.
