//
//  HealthBridge.swift
//  AscendHealthBridge
//
//  Minimal, read-only HealthKit bridge for the Ascend web app.
//  - Requests read access to a fixed list of types (nothing is written).
//  - Uses anchored queries so only new/deleted samples are fetched.
//  - Registers observer queries with background delivery so iOS wakes the app
//    when Apple Health receives new data (e.g. from Oura), then POSTs batches to
//    POST <endpoint>/api/health/ingest with a Bearer token.
//  - Never fails the app: denied permissions or unavailable background delivery
//    simply mean fewer metrics; the web app's manual logging keeps working.
//
//  Usage (Capacitor or any WKWebView shell):
//      HealthBridge.shared.configure(endpoint: URL(string: "https://your-app.example")!, token: "<ingest token>")
//      HealthBridge.shared.start()           // call from application(_:didFinishLaunchingWithOptions:)
//      HealthBridge.shared.syncNow()         // manual refresh (also wired to a JS message handler)
//
//  Required: HealthKit capability, NSHealthShareUsageDescription in Info.plist.
//

import Foundation
import HealthKit

public final class HealthBridge {
    public static let shared = HealthBridge()

    private let store = HKHealthStore()
    private var endpoint: URL?
    private var token: String = ""
    private let session = URLSession(configuration: .default)
    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "ascend.healthbridge", qos: .utility)
    private var observers: [HKObserverQuery] = []

    /// (app metric id, HealthKit type, unit)
    private struct Metric {
        let id: String
        let type: HKSampleType
        let unit: HKUnit?
    }

    private lazy var metrics: [Metric] = {
        var m: [Metric] = []
        func q(_ id: String, _ ident: HKQuantityTypeIdentifier, _ unit: HKUnit) {
            if let t = HKObjectType.quantityType(forIdentifier: ident) { m.append(Metric(id: id, type: t, unit: unit)) }
        }
        q("steps", .stepCount, .count())
        q("active_energy", .activeEnergyBurned, .kilocalorie())
        q("distance", .distanceWalkingRunning, .meterUnit(with: .kilo))
        q("exercise_minutes", .appleExerciseTime, .minute())
        q("resting_hr", .restingHeartRate, HKUnit.count().unitDivided(by: .minute()))
        q("heart_rate", .heartRate, HKUnit.count().unitDivided(by: .minute()))
        q("hrv", .heartRateVariabilitySDNN, .secondUnit(with: .milli))
        q("body_mass", .bodyMass, .gramUnit(with: .kilo))
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { m.append(Metric(id: "sleep", type: sleep, unit: nil)) }
        m.append(Metric(id: "workout", type: HKObjectType.workoutType(), unit: nil))
        return m
    }()

    public func configure(endpoint: URL, token: String) {
        self.endpoint = endpoint
        self.token = token
    }

    /// Request permissions, register observers, run a first sync.
    public func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let types = Set(metrics.map { $0.type })
        store.requestAuthorization(toShare: nil, read: types) { [weak self] ok, _ in
            guard let self = self else { return }
            // HealthKit never reveals read-denials directly; we report "granted" only when the
            // request succeeded and samples are actually returned for the type.
            self.registerObservers()
            self.syncNow(reportPermissions: ok)
        }
    }

    private func registerObservers() {
        for m in metrics {
            let obs = HKObserverQuery(sampleType: m.type, predicate: nil) { [weak self] _, completion, _ in
                self?.fetchAndPost(metric: m) { completion() }
            }
            store.execute(obs)
            observers.append(obs)
            store.enableBackgroundDelivery(for: m.type, frequency: .hourly) { _, _ in }
        }
    }

    /// Manual refresh: fetch new samples for every metric and post them.
    public func syncNow(reportPermissions: Bool = false) {
        let group = DispatchGroup()
        for m in metrics {
            group.enter()
            fetchAndPost(metric: m, reportPermissions: reportPermissions) { group.leave() }
        }
    }

    private func anchor(for id: String) -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: "ascend.anchor.\(id)") else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func save(anchor: HKQueryAnchor?, for id: String) {
        guard let a = anchor, let data = try? NSKeyedArchiver.archivedData(withRootObject: a, requiringSecureCoding: true) else { return }
        defaults.set(data, forKey: "ascend.anchor.\(id)")
    }

    private func fetchAndPost(metric m: Metric, reportPermissions: Bool = false, completion: @escaping () -> Void) {
        // First run: look back 30 days; afterwards the anchor keeps it incremental.
        let predicate: NSPredicate? = anchor(for: m.id) == nil ? HKQuery.predicateForSamples(withStart: Calendar.current.date(byAdding: .day, value: -30, to: Date()), end: nil) : nil
        let query = HKAnchoredObjectQuery(type: m.type, predicate: predicate, anchor: anchor(for: m.id), limit: HKObjectQueryNoLimit) { [weak self] _, samples, _, newAnchor, _ in
            guard let self = self else { return completion() }
            let samples = samples ?? []
            var payloadSamples: [[String: Any]] = []
            var payloadWorkouts: [[String: Any]] = []
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            for s in samples {
                let source = s.sourceRevision.source.name
                let device = s.device?.name ?? ""
                if let w = s as? HKWorkout {
                    payloadWorkouts.append([
                        "uuid": w.uuid.uuidString,
                        "activityType": HealthBridge.name(for: w.workoutActivityType),
                        "start": iso.string(from: w.startDate),
                        "end": iso.string(from: w.endDate),
                        "activeEnergyKcal": w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) as Any,
                        "distanceKm": w.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) as Any,
                        "source": source,
                    ])
                } else if let c = s as? HKCategorySample, m.id == "sleep" {
                    payloadSamples.append([
                        "type": "sleep",
                        "value": c.endDate.timeIntervalSince(c.startDate) / 60.0,
                        "unit": "min",
                        "start": iso.string(from: c.startDate),
                        "end": iso.string(from: c.endDate),
                        "source": source,
                        "device": device,
                        "uuid": c.uuid.uuidString,
                        "metadata": ["stage": HealthBridge.sleepStage(c.value)],
                    ])
                } else if let qs = s as? HKQuantitySample, let unit = m.unit {
                    payloadSamples.append([
                        "type": m.id,
                        "value": qs.quantity.doubleValue(for: unit),
                        "unit": unit.unitString,
                        "start": iso.string(from: qs.startDate),
                        "end": iso.string(from: qs.endDate),
                        "source": source,
                        "device": device,
                        "uuid": qs.uuid.uuidString,
                    ])
                }
            }
            var body: [String: Any] = ["bridge": "native", "backgroundDelivery": true, "bridgeVersion": "1.0", "samples": payloadSamples, "workouts": payloadWorkouts]
            if reportPermissions {
                // Only claim "granted" when data came back; HealthKit hides read denials.
                body["permissions"] = [m.id: samples.isEmpty ? "unknown" : "granted"]
            }
            if payloadSamples.isEmpty && payloadWorkouts.isEmpty && !reportPermissions {
                self.save(anchor: newAnchor, for: m.id)
                return completion()
            }
            self.post(body) { ok in
                if ok { self.save(anchor: newAnchor, for: m.id) }
                completion()
            }
        }
        store.execute(query)
    }

    private func post(_ body: [String: Any], completion: @escaping (Bool) -> Void) {
        guard let endpoint = endpoint, let data = try? JSONSerialization.data(withJSONObject: body) else { return completion(false) }
        var req = URLRequest(url: endpoint.appendingPathComponent("api/health/ingest"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = data
        session.dataTask(with: req) { _, resp, _ in
            completion((resp as? HTTPURLResponse)?.statusCode == 200)
        }.resume()
    }

    private static func sleepStage(_ v: Int) -> String {
        switch v {
        case HKCategoryValueSleepAnalysis.inBed.rawValue: return "inBed"
        case HKCategoryValueSleepAnalysis.awake.rawValue: return "awake"
        default:
            if #available(iOS 16.0, *) {
                switch v {
                case HKCategoryValueSleepAnalysis.asleepCore.rawValue: return "asleepCore"
                case HKCategoryValueSleepAnalysis.asleepDeep.rawValue: return "asleepDeep"
                case HKCategoryValueSleepAnalysis.asleepREM.rawValue: return "asleepREM"
                default: return "asleepUnspecified"
                }
            }
            return "asleepUnspecified"
        }
    }

    private static func name(for t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "HKWorkoutActivityTypeRunning"
        case .walking: return "HKWorkoutActivityTypeWalking"
        case .cycling: return "HKWorkoutActivityTypeCycling"
        case .traditionalStrengthTraining: return "HKWorkoutActivityTypeTraditionalStrengthTraining"
        case .functionalStrengthTraining: return "HKWorkoutActivityTypeFunctionalStrengthTraining"
        case .highIntensityIntervalTraining: return "HKWorkoutActivityTypeHighIntensityIntervalTraining"
        case .yoga: return "HKWorkoutActivityTypeYoga"
        case .swimming: return "HKWorkoutActivityTypeSwimming"
        case .rowing: return "HKWorkoutActivityTypeRowing"
        case .hiking: return "HKWorkoutActivityTypeHiking"
        case .elliptical: return "HKWorkoutActivityTypeElliptical"
        case .stairClimbing: return "HKWorkoutActivityTypeStairClimbing"
        case .coreTraining: return "HKWorkoutActivityTypeCoreTraining"
        case .flexibility: return "HKWorkoutActivityTypeFlexibility"
        case .cooldown: return "HKWorkoutActivityTypeCooldown"
        default: return "HKWorkoutActivityTypeOther(\(t.rawValue))"
        }
    }
}
