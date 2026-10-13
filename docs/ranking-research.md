# Ranking research

Research compiled 2026-10-13 to calibrate the Ascend ranking engine. For every domain we separate **what experts recommend** (guidelines) from **what share of people actually do it** (population rarity). The engine uses both: guideline adherence sets the C/B boundary ("meets the recommendation"), population rarity sets A and S ("uncommon" and "rare").

Sourcing caveats: figures were gathered from government data briefs, peer-reviewed papers, and major health organisations. Where a primary table could not be opened and a figure came through a reputable secondary summary it is marked *(secondary)*. Estimates we derived ourselves are marked *(est.)*. See `ranking-methodology.md` for how these numbers become scores.

---

## 1. Fitness

### Guidelines
| Component | Recommendation | Source |
|---|---|---|
| Aerobic | 150–300 min/week moderate (or 75–150 vigorous); >300 min = "additional benefits" | HHS *Physical Activity Guidelines for Americans*, 2nd ed., 2018 — https://health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf ; WHO 2020 (Bull et al., *BJSM*) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7719906/ |
| Strength | All major muscle groups on 2+ days/week | HHS 2018; ACSM 2026 Resistance Training Position Stand — https://acsm.org/resistance-training-guidelines/ |
| Frequency | 30–60 min moderate on ≥5 days or 20–60 min vigorous on ≥3 days; 48 h between sessions for the same muscle group | ACSM position stand, Garber et al., *MSSE* 2011 |
| Recovery | At least one recovery day per week; overreaching → overtraining continuum | ECSS–ACSM consensus, Meeusen et al., *MSSE* 2013 |
| Steps | Mortality risk falls to ~8,000–10,000/day (<60 y) and 6,000–8,000 (≥60 y); 12,000 vs 4,000 ≈ HR 0.35 | Saint-Maurice et al., *JAMA* 2020; Paluch et al., *Lancet Public Health* 2022; Master et al., *Nature Medicine* 2022 |

### Population rarity (US adults)
| Statistic | Value | Source |
|---|---|---|
| Meet aerobic guideline | **47.2 %** (2024) | NCHS Data Brief 555 — https://www.cdc.gov/nchs/products/databriefs/db555.htm |
| Meet muscle-strengthening guideline | **~31 %** (2020–2022) | NCHS Data Brief 443; Healthy People 2030 PA-04 |
| Meet **both** | **24.2 %** (2020); 25.3 % (2022) | NCHS Data Brief 443 — https://www.cdc.gov/nchs/products/databriefs/db443.htm ; HP2030 PA-05 |
| No leisure-time activity at all | **26.3 %** (2022) | HP2030 PA-01 |
| Exercise ≥30 min 0 / 1–2 / 3–4 / 5+ days per week | ~30 % / 19 % / 24 % / 27 % | Gallup-Healthways 2009–2016 — https://news.gallup.com/poll/118570/nearly-half-exercise-less-three-days-week.aspx |
| Steps/day: <5,000 / 5,000–9,999 / ≥10,000 | **36 % / 48 % / 16 %**; US mean ≈ 4,800–6,600 | Tudor-Locke et al., *AJHP* 2011 (NHANES); Bassett 2010; Althoff et al., *Nature* 2017 |
| Keep exercising at 3 / 6 / 12 months | 63 % of new gym members quit before month 3; ~50 % drop out by 6 months; **<4 %** stay continuously active 12 months | Sperandei et al., *J Sci Med Sport* 2016; Dishman review; Norcross 2002 |
| Cardio fitness (VO₂max) norms | Cooper Institute/FRIEND percentile tables by age and sex (men 20–29: p50 ≈ 48, p95 ≈ 55 mL/kg/min) | Kaminsky et al., *Mayo Clin Proc* 2015 |

### Takeaways used by the engine
* 150 moderate-minutes/week is roughly the population **median** → score 50 (C).
* Meeting both guidelines (≈ top quarter) → B territory. 300+ min with 3+ strength days sustained → A.
* Consistency over 12 weeks matters more than any single week because dropout concentrates in weeks 1–12; sustained year-long training is a top-few-percent behaviour.
* No bonus for 7/7 training days; recovery substat penalises zero rest days.

---

## 2. Sleep

### Guidelines
| Item | Recommendation | Source |
|---|---|---|
| Duration | Adults ≥7 h/night regularly; 7–9 h recommended (18–64) | AASM/SRS consensus, Watson et al., *SLEEP* 2015 — https://aasm.org/resources/pdf/adultsleepdurationconsensus.pdf ; NSF, Hirshkowitz et al., *Sleep Health* 2015 |
| Quality | Efficiency ≥85 %, latency ≤30 min, ≤1 awakening >5 min, WASO ≤20 min | NSF, Ohayon et al., *Sleep Health* 2017 |
| Regularity | Consistent timing matters for health; no numeric tolerance published | NSF consensus, Sletten et al., *Sleep Health* 2023 |

### Population rarity
| Statistic | Value | Source |
|---|---|---|
| Adults sleeping <7 h | **30.5 %** (NHIS 2024); 36 % (BRFSS 2022) | NCHS Data Brief 559 — https://www.cdc.gov/nchs/products/databriefs/db559.htm |
| ≤6 h / 7–8 h / ≥9 h | 29.7 % / 61.6 % / 8.7 % | NHIS 2011–2014 |
| Wearable-measured average | **6.6–6.9 h** (Fitbit, n=120k) | Quer et al., *JAMA IM* 2020 |
| Bedtime variation >1 h | **~45 %** of adults; onset SD >90 min: 25.6 % | MESA, Huang & Redline 2019/2020 |
| Sleep Regularity Index | Median SRI 81; bottom quintile <72; most-regular quintiles have 20–48 % lower mortality — regularity predicts mortality more strongly than duration | Windred et al., *SLEEP* 2024 (UK Biobank, n≈61k) |
| Social jetlag ≥1 h | 46.5 % (NHANES 2017–2020) | PMC9644264 |
| Resting HR | Mean 65 bpm; Oura lowest nightly ≈ 57 | Quer et al., *PLOS ONE* 2020; Oura |
| HRV (RMSSD) | Mean ≈ 42 ms (SD 15); declines ~10 ms/decade | Nunan et al., *PACE* 2010 |
| Oura score bands | 85–100 optimal, 70–84 good, 60–69 fair, <60 pay attention; member average sleep score ≈ 77 | Oura support/blog |

### Takeaways
* 7 h average ≈ above median once measured objectively → C/B boundary; 7.5–8.5 h sustained with ≥85 % nights at target → A.
* Regularity gets 30 % of the sleep score. SD ≤30 min is the MESA reference band (S), 45 min ≈ A, 60 min ≈ B, 90 min ≈ C, >120 min ≈ E.
* Duration is a hard gate: no amount of regularity makes a 5.5 h average a C.

---

## 3. Cooking / nutrition

### Guidelines
* No federal "meals per week" guideline. Cohort evidence: home-cooked main meals **>5×/week** associate with better diet quality and 28 % lower odds of overweight (Mills et al., *IJBNPA* 2017, UK Fenland, n=11,396 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5561571/); cooking dinner 6–7×/week vs 0–1 → fewer calories, less sugar (Wolfson & Bleich, *Public Health Nutrition* 2015).
* Dietary Guidelines 2020–2025: 2 cup-eq fruit + 2.5 cup-eq vegetables/day (2,000 kcal).
* Diversity: >30 plant foods/week associates with a more diverse microbiome (American Gut Project, McDonald et al. 2018) — observational.

### Population rarity
| Statistic | Value | Source |
|---|---|---|
| Home-cooked dinners/week: 0–1 / 2–5 / 6–7 | **8 % / 44 % / 48 %** (household level) | Wolfson & Bleich 2015, NHANES 2007–2010 |
| Cook on a given day | ~46 % of men, ~70 % of women (education-dependent) | Taillie, *Nutrition Journal* 2018 (ATUS) |
| Food-away-from-home share of food spending | **58.9 %** (2024, record) | USDA ERS |
| Meet fruit / vegetable recommendations | **12.3 % / 10.0 %** | CDC MMWR 71(1), 2022 |
| Healthy Eating Index | Mean 58/100 | USDA FNS HEI-2020 |

### Takeaways
* Cooking dinner most nights is median behaviour; cooking the majority of all meals (10+/week) across most days with a rotation of 5+ dishes is uncommon → B/A.
* We count any home-cooked meal, capped at 3/day, so breakfast and lunch matter but logging can't be farmed.
* Range (distinct dishes, new recipes) carries 20 % because repertoire is what makes cooking sustainable.

---

## 4. Wealth / financial health

### Guidelines
| Item | Recommendation | Source |
|---|---|---|
| Emergency fund | 3–6 months of essential expenses | CFPB; standard planner guidance |
| Savings rate | 15 % of pre-tax income for retirement (incl. employer match); 50/30/20 → 20 % | Fidelity — https://www.fidelity.com/viewpoints/retirement/how-much-do-i-need ; Warren & Tyagi 2005 |
| Retirement multiples | 1× salary by 30, 3× by 40, 6× by 50, 8× by 60, 10× by 67 | Fidelity 2025 |
| Debt | 28/36 rule; carry no revolving card balance | CFPB; NY Fed |

### Population rarity (US)
| Statistic | Value | Source |
|---|---|---|
| Median household net worth by age (SCF 2022, 2022 $) | <35: **$39,000**; 35–44: $135,600; 45–54: $247,200; 55–64: $364,500; 65–74: $409,900; 75+: $335,600 | Federal Reserve Bulletin Oct 2023 — https://www.federalreserve.gov/publications/October-2023-changes-in-us-family-finances-from-2019-to-2022.htm ; SCF 2025 (released 2026-10-09): all-family median $215,900 |
| Net worth percentiles by age (p25 / p50 / p75 / p90 / p95) | <35: ~$2k / $39k / ~$150k / ~$370k / ~$600k; 35–44: ~$25k / $136k / ~$420k / ~$980k / ~$1.6M; 45–54: ~$45k / $247k / ~$750k / ~$1.9M / ~$3.1M; 55–64: ~$60k / $365k / ~$1.1M / ~$2.6M / ~$4.5M *(est. except medians; SCF microdata via DQYDJ/Compound Ladder)* | https://dqydj.com/net-worth-by-age-calculator/ *(secondary)* |
| Can cover a $400 emergency in cash | **63 %** (2024) | Fed SHED 2024 — https://www.federalreserve.gov/newsevents/pressreleases/other20250528a.htm |
| Have 3 months of expenses saved | **55 %** (SHED 2024); 46 % (Bankrate 2025); **6+ months: 27 %**; none: 24 % | SHED 2024; Bankrate June 2025 |
| Personal saving rate | **4.6 %** (BEA 2025); typical 401(k) all-in rate 12–14 % among participants | BEA/FRED; Vanguard *How America Saves* 2025; Fidelity Q2 2025 |
| Carry a credit-card balance month to month | **46 %** of cardholders; 60 % of those for ≥1 year | Bankrate July 2025; SHED 2024 |
| Have any retirement account | **54.9 %** (2025); conditional median balance $106,000 | SCF 2025 |
| Feel retirement savings are "on track" | **35 %** | SHED 2024 |
| Own stock directly or indirectly | **56 %** (2025) | SCF 2025 |

### Takeaways
* Resilience, not income: emergency fund (30 %), savings rate (25 %) and high-interest debt (20 %) carry 75 % of the score. A high earner with heavy card debt lands in D.
* Age-adjusted net-worth percentile is used directly as a 0–100 substat (15 %).
* 3 months saved ≈ median → C/B; 6 months ≈ top 27 % → B; 12 months ≈ top ~10–15 % → A/S.
* Everything is a personal estimate, not advice.

---

## 5. Skincare / personal care

### Guidelines
* AAD: gentle cleanser AM/PM, moisturiser daily, broad-spectrum **SPF 30+ every day**; retinoids at night, introduced gradually (AAD consumer guidance; https://aad.org).

### Population rarity
| Statistic | Value | Source |
|---|---|---|
| Follow a daily skin-care routine | **47 %** *(industry poll, CeraVe 2021)* | https://practicaldermatology.com/news/new-cerave-poll-reveals-confusion-about-healthy-clean-skin-and-how-to-achieve-it |
| Use sunscreen daily | ~29 % *(same poll)* | — |
| "Always/most of the time" sunscreen on face when outdoors | men **18 %**, women **43 %**; face+body men 14 %, women 30 % | Holman et al., *JAAD* 2015 (CDC) — https://stacks.cdc.gov/view/cdc/55069/cdc_55069_DS1.pdf |
| Objectively measured adherence to daily topical regimens | **32–60 %** of days in trials; 89 % only with weekly accountability | Krejci-Manwaring 2007; Yentzer 2011 (Wake Forest) |

### Takeaways
* Rank is adherence-based: 30-day E <30 %, D 30–49, C 50–69, B 70–84, A 85–94, S ≥95 (90-day thresholds 5 points lower in the research; we weight 30-day 45 % and 90-day 30 %).
* Streaks are deliberately a small share (10 %) so one missed day never collapses the rank (Lally 2010; Silverman & Barasch 2023 on broken-streak demotivation).

---

## 6. Sobriety / abstinence

### Definitions
* NIAAA moderate drinking: ≤2/day men, ≤1/day women; binge = 5+/4+ in ~2 h; heavy = binge on 5+ days/month (SAMHSA NSDUH 2023 — https://www.samhsa.gov/data/sites/default/files/NSDUH%202023%20Annual%20Release/2023-nsduh-main-highlights.pdf).

### Population rarity
| Statistic | Value | Source |
|---|---|---|
| Adults who drank in the past year / month | 67 % / ~48 %; ~15 % lifetime abstainers | NIAAA, NSDUH 2023–2024 |
| Past-month binge drinking (12+) | 21.7 % | NSDUH 2023 |
| Dry January completion | **~70 %** of registered participants, **36 %** of casual attempters; 51 % in app users | de Visser et al., *Alcohol and Alcoholism* 2020; Alcohol Change UK |
| Smoking quit attempts | 53 % try per year, **8.8 %** succeed; most relapse in the first 8 days; 62 % relapse within 2 weeks; **3–5 %** of unaided attempts last 6–12 months | CDC Cessation Fast Facts 2022; Hughes et al., *Addiction* 2004; Garvey 1992 |
| After 1 year abstinent | annual relapse 2–15 %, declining toward 5 years | NESARC analyses; Dennis et al., *Eval Rev* 2007 |
| Serious attempts needed to resolve a problem | median **2** | Kelly et al., *ACER* 2019 |
| Daily cannabis use, ages 19–30 | 10 % (2023) | NIDA Monitoring the Future |

### Takeaways
* Streak thresholds: E 0–7 d, D 8–29, C 30–89, B 90–179, A 180–364, S 365+.
* A reset lowers the score (current run is 50 %) but 90-day clean ratio (35 %) and resilience (15 %) keep most of it. Language is never moralising; the median successful person needed two tries.

---

## 7. Habits / discipline

### Evidence
| Finding | Value | Source |
|---|---|---|
| Time for a behaviour to become automatic | **18–254 days, median 66**; a single missed day does not materially affect formation | Lally et al., *Eur J Soc Psychol* 2010 |
| Meta-analysis | median 59–66 days, range 4–335, means 106–154 | Singh et al., *Healthcare* 2024 |
| Resolution maintenance | 77 % at 1 week, **55 % at 1 month**, 43 % at 3 months, 40 % at 6 months, 19 % at 2 years; 46 % vs 4 % (resolvers vs non-resolvers) at 6 months | Norcross & Vangarelli 1988; Norcross et al., *J Clin Psychol* 2002 |
| Self-monitoring persistence | <50 % still tracking after week 10 | PMC6856872 |
| Broken streaks | Highlighting an intact streak increases engagement; pointing out a broken one does not | Silverman & Barasch, *J Consumer Research* 2023 |
| Prevalence of common habits | Meditation (past year) 17.3 %; 17–23 % read zero books/year; weekly journaling ~8–20 % | NCCIH/NHIS 2022; Gallup 2022; Pew 2021 |

### Takeaways
* Adherence thresholds (30-day): E <40 %, D 40–59, C 60–74, B 75–89, A 90–96, S ≥97. 90-day: E <30, D 30–49, C 50–64, B 65–79, A 80–92, S ≥93.
* The 66-day streak is a named milestone ("Automatic") because it is the empirical median for habit formation.
* Grace: today is excluded until completed so an unfinished morning isn't a miss.

---

## Cross-domain calibration
"Typical" population behaviour sits roughly at: cook dinner 6–7×/wk ≈ 48 %; daily skincare ≈ 47 %; 7+ h sleep ≈ 65–70 %; meet aerobic guideline ≈ 47 %; 3-month emergency fund ≈ 46–55 %; alcohol-free past month ≈ 52 %. D therefore means "around typical", C "clearly above typical", and S is reserved for the top ~3–5 % **sustained over months**, which the time gates in the methodology enforce.
