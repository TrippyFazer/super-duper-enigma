# Apple Health → TFHealth with an iOS Shortcut

**Upload URL:** `https://tfhealth.tfwebapps.com/api/health/ingest`
Method `POST`, header `Authorization: Bearer <your token>`, JSON body.

Each sample needs only: `type`, `value`, `start`, `end`, `source`. No UUID.
Optional: `unit` (lets the server convert miles → km, lb → kg, kJ → kcal).

The server answers with what it did, for example:

```json
{ "ok": true, "received": 5, "stored": 5, "updated": 0, "duplicates": 0, "rejectedCount": 0, "rejected": [] }
```

Run the same Shortcut again and you should see `"stored": 0, "duplicates": 5`.

---

## Part 0 — Get your token (once)

1. Open TFHealth on the phone and sign in.
2. **Profile → Settings → Connected services → Apple Health → Connect.**
3. Copy the token (it starts with `ah_`). It is shown **once**; paste it into Notes for now.
   Lost it? Connect again — that makes a new token and the old one stops working.

## Part 1 — Steps only, 5 samples (the test)

Open **Shortcuts → +** (new shortcut). Name it **TFHealth Sync**. Add these actions in order.
Search for each action by the name in bold.

1. **Find Health Samples**
   - Tap **Type** → choose **Steps**.
   - Tap **Add Filter** → **Start Date** → **is in the last** → **1** **days**.
   - **Sort by**: Start Date. **Limit**: turn on, **5**.
   - If you see **Group By**, leave it **off / None**. (A grouped total changes every run and would be
     counted as new data.)
2. **Repeat with Each** — it fills in *Health Samples* by itself.
   Everything in steps 3–6 goes **inside** the repeat (between *Repeat with Each* and *End Repeat*).
3. **Format Date**
   - Tap the blue **Date** field → pick **Repeat Item** → tap **Repeat Item** again → choose **Start Date**.
   - **Date Format**: **ISO 8601**. Turn on **Include ISO 8601 Time**.
4. **Format Date** (a second one), the same but with **End Date**.
   Long-press each to **Rename** them *Start* and *End* so you can tell them apart.
5. **Dictionary** — tap **Add new item** → **Text** five times:

   | Key | Value |
   |---|---|
   | `type` | type the word `steps` |
   | `value` | **Repeat Item** → tap it → **Value** |
   | `start` | the **Start** (formatted date) variable |
   | `end` | the **End** (formatted date) variable |
   | `source` | **Repeat Item** → tap it → **Source** |

   **Check as you go:** when you tap *Repeat Item*, a list of its properties appears. You need
   **Value**, **Start Date**, **End Date** and **Source** in that list. If any is missing, stop and
   note which — the server can work around a missing one, but the steps below assume they are there.
6. **Add to Variable** — Variable name: `samples`. (Input: *Dictionary*.)
7. After **End Repeat**: **Get Contents of URL**
   - URL: `https://tfhealth.tfwebapps.com/api/health/ingest`
   - Tap **Show More**. **Method**: **POST**.
   - **Headers** → Add new header: key `Authorization`, value `Bearer ah_…` (the word *Bearer*, one
     space, then your token).
   - **Request Body**: **JSON**. Add new field → **Text** → key `samples` → value: the **samples** variable.
8. **Show Result** — input: *Contents of URL*.

Tap ▶︎. The first time, iOS asks to let Shortcuts read Health → allow **Steps**.

**What you should see:** `"ok": true`, `"stored": 5` (or fewer, if you have fewer samples today).
Run it again: `"stored": 0`, `"duplicates": 5`. That is the duplicate check working.

| You see | It means | Fix |
|---|---|---|
| `unauthorized` | Token wrong or header misspelled | Header key exactly `Authorization`, value `Bearer ah_…` |
| `The body was not JSON` | Request Body not set to JSON | Step 7: Request Body → JSON |
| `No samples found in the body` | `samples` field missing or empty | Step 7: field key `samples`, value the *samples* variable; and step 6 is inside the repeat |
| a reason containing `ISO 8601` | Dates went as text like "Oct 13 at 5:06 PM" | Steps 3–4: Date Format ISO 8601, *Include ISO 8601 Time* on |
| `type "…" is not one the app tracks` | Typo in the `type` value | Use the exact words in the table in Part 3 |

## Part 2 — All of today's steps

In step 1, turn **Limit** off. Run it. Steps appear on the TFHealth home screen within a moment.

## Part 3 — Add the other metrics

For each metric, **copy the whole block** from Part 1 (Find Health Samples → Repeat with Each →
two Format Dates → Dictionary → Add to Variable `samples` → End Repeat) and place the copy
**above** *Get Contents of URL*. In the copy change only:

- **Find Health Samples → Type** (left column), and
- the Dictionary's **`type`** text (right column).

| Find Health Samples Type | `type` to send | Extra |
|---|---|---|
| Steps | `steps` | — |
| Active Energy | `active_energy` | add a `unit` item (see below) |
| Walking + Running Distance | `distance` | add a `unit` item |
| Exercise Minutes | `exercise_minutes` | — |
| Resting Heart Rate | `resting_hr` | — |
| Heart Rate Variability | `hrv` | — |
| Weight (Body Mass) | `body_mass` | add a `unit` item |
| Sleep Analysis | `sleep` | see *Sleep* |

The names in the left column are what the Health app calls them; Shortcuts' list may word them
slightly differently. Pick the closest one.

**Units (distance, energy, weight).** Add a sixth Dictionary item: key `unit`, value
**Repeat Item → Unit**. If *Unit* is not in the property list, type the unit yourself instead
(`mi` or `km`, `lb` or `kg`, `kcal` or `kJ` — whatever the Health app shows you). Without a unit
the server assumes km, kg and kcal, so a mile would be counted as a kilometre.

**Sleep.** Keep `value` = **Repeat Item → Value**. For sleep, Shortcuts gives the stage
(*In Bed, Core, Deep, REM, Awake…*), possibly as a number; the server understands both. Set the
filter to **is in the last 2 days** so last night is always included.

**Workouts** are not covered by *Find Health Samples*; leave them for now.

## Part 4 — Run it by itself

**Shortcuts → Automation → + → Time of Day** → e.g. 7:30 AM → **Daily** → **Run Immediately** →
choose **TFHealth Sync**. Add a second one for the evening if you like. Running more often is
safe: repeats are counted as duplicates, not as new steps.

## How duplicates are caught without a UUID

The server builds its own ID from **type + start + end + source** (and, for sleep, the stage):

- Times are compared as moments, to the second, so `10:00-04:00` and `14:00Z` are the same.
- The **value is not part of the ID**: if the same source reports the same time window again with a
  different number, the new number **replaces** the old one; it is never added on top.
- Samples that do arrive with a UUID (the native bridge) are still matched by UUID.

### Limits of that

- **Deleting in the Health app is not seen.** Without a UUID the server cannot tell a deleted sample
  from one the Shortcut simply did not send this time; what was received stays.
- **Two genuinely different samples with the same type, start, end and source** would be treated as
  one. HealthKit sources don't normally write that, but a misbehaving third-party app could.
- **A changed window is a new sample.** If a source rewrites a sample with a different start or end,
  both are kept and the steps in the overlap are counted twice. HealthKit samples don't change their
  times in practice; *Group By* in Shortcuts does — which is why Part 1 says to leave it off.
- **Precision is one second.** Shortcuts' ISO 8601 dates have no fractions; two samples from one
  source starting and ending within the same second would collide (not something real sources do).
- **The source name is part of the ID.** Renaming your iPhone or Watch makes the windows sent again
  after the rename look new and get stored a second time. They are not counted twice in the day's
  steps — overlapping samples from different source names are de-duplicated when the day is added up —
  but they take up extra rows.
