/**
 * Zema AI - Clinical Vitals Calculation Engine
 * 
 * Computes clinical metrics deterministically for medical records.
 * All math is computed in code. No external API or model calls.
 * Rounds display values to 1 decimal place, but maintains full precision internally.
 */

// Valid ranges for inputs
const VALID_RANGES = {
  age: { min: 0, max: 120 },
  sbp: { min: 60, max: 300 },
  dbp: { min: 30, max: 200 },
  spo2: { min: 50, max: 100 },
  pulse: { min: 30, max: 250 },
  temperature: { min: 90, max: 110 },
  bloodGlucose: { min: 20, max: 1000 },
};

// Severity mappings for sorting
const SEVERITY_WEIGHTS = {
  critical: 4,
  warning: 3,
  info: 2,
  reassurance: 1,
};

/**
 * Validates and computes clinical metrics from raw inputs, applying interpretation rules.
 * 
 * @param {Object} inputs 
 * @param {number|string} inputs.age - Patient age in years
 * @param {string} inputs.sex - Patient gender ("M"/"F" or "Male"/"Female")
 * @param {number|string} inputs.sbp - Systolic Blood Pressure (mmHg)
 * @param {number|string} inputs.dbp - Diastolic Blood Pressure (mmHg)
 * @param {number|string} inputs.weight - Weight in kg
 * @param {number|string} inputs.height - Height in cm
 * @param {number|string} inputs.spo2 - Oxygen saturation (%)
 * @param {number|string} inputs.pulse - Heart rate (bpm)
 * @param {number|string} inputs.temperature - Body temperature (°F)
 * @param {number|string} inputs.bloodGlucose - Blood Glucose (mg/dL)
 * 
 * @returns {Object} Result containing computed metrics, validation errors, and statuses.
 */
export function calculateZemaVitals(inputs = {}, rules = []) {
  const result = {
    inputs: {},
    rejectedFields: [],
    missingFields: [],
    metrics: {
      bmi: { raw: null, display: "—", category: null, severity: null },
      bsa: { raw: null, display: "—", category: null, severity: null },
      map: { raw: null, display: "—", category: null, severity: null },
      pulsePressure: { raw: null, display: "—", category: null, severity: null },
      shockIndex: { raw: null, display: "—", category: null, severity: null },
      ibw: { raw: null, display: "—", category: null, severity: null },
      bmr: { raw: null, display: "—", category: null, severity: null },
    },
    status: "Complete",
    bpError: null,
    pediatricNote: null,
    isPediatric: false,
    firedRules: [],
    dietRecommendations: [],
    interpretationParagraph: "",
    footer: "Zema AI is a deterministic clinical rules engine. Outputs are decision-support prompts based on entered vitals and do not constitute a diagnosis. Clinical judgment applies.",
  };

  // 1. Parse and extract inputs
  const parseNumber = (val) => {
    if (val === "" || val === null || val === undefined) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  };

  const parseGender = (gender) => {
    if (!gender) return null;
    const normalized = String(gender).trim().toUpperCase();
    if (normalized.startsWith("M")) return "M";
    if (normalized.startsWith("F")) return "F";
    return null;
  };

  const rawAge = parseNumber(inputs.age);
  const rawSex = parseGender(inputs.sex);
  const rawSbp = parseNumber(inputs.sbp);
  const rawDbp = parseNumber(inputs.dbp);
  const rawWeight = parseNumber(inputs.weight);
  const rawHeight = parseNumber(inputs.height);
  const rawSpo2 = parseNumber(inputs.spo2);
  const rawPulse = parseNumber(inputs.pulse);
  const rawTemperature = parseNumber(inputs.temperature);
  const rawBloodGlucose = parseNumber(inputs.bloodGlucose);

  const fieldsToCheck = [
    { key: "age", val: rawAge, label: "Age" },
    { key: "sex", val: rawSex, label: "Sex" },
    { key: "sbp", val: rawSbp, label: "Systolic BP" },
    { key: "dbp", val: rawDbp, label: "Diastolic BP" },
    { key: "weight", val: rawWeight, label: "Weight" },
    { key: "height", val: rawHeight, label: "Height" },
    { key: "spo2", val: rawSpo2, label: "SpO₂" },
    { key: "pulse", val: rawPulse, label: "Pulse" },
    { key: "temperature", val: rawTemperature, label: "Temperature" },
    { key: "bloodGlucose", val: rawBloodGlucose, label: "Blood Glucose" },
  ];

  // 2. Validate fields and identify missing / rejected fields
  fieldsToCheck.forEach(({ key, val }) => {
    if (val === null) {
      result.missingFields.push(key);
      result.inputs[key] = null;
      return;
    }

    // Check bounds for numeric fields
    if (VALID_RANGES[key]) {
      const range = VALID_RANGES[key];
      if (val < range.min || val > range.max) {
        result.rejectedFields.push(key);
        result.inputs[key] = null; // Rejected
        return;
      }
    }

    result.inputs[key] = val;
  });

  // 3. Diastolic/Systolic sanity check
  const sbp = result.inputs.sbp;
  const dbp = result.inputs.dbp;
  if (sbp !== null && dbp !== null) {
    if (dbp >= sbp) {
      result.bpError = "Invalid BP entry (diastolic >= systolic)";
      // Reject both BP fields
      result.inputs.sbp = null;
      result.inputs.dbp = null;
      if (!result.rejectedFields.includes("sbp")) result.rejectedFields.push("sbp");
      if (!result.rejectedFields.includes("dbp")) result.rejectedFields.push("dbp");
    }
  }

  // 4. Update overall status to "Partial" if anything is missing or rejected
  if (result.missingFields.length > 0 || result.rejectedFields.length > 0) {
    result.status = "Partial - incomplete vitals";
  }

  // 5. Pediatric Guard Check (check first before applying interpretation logic in UI)
  const age = result.inputs.age;
  if (age !== null && age < 18) {
    result.isPediatric = true;
    result.pediatricNote = "Pediatric patient (age < 18). Adult vitals thresholds do not apply. Refer to IAP age- and sex-specific growth charts for BMI interpretation.";
  }

  // Helper for 1-decimal rounding of display values
  const formatDisplay = (num) => {
    if (num === null || num === undefined) return "—";
    return num.toFixed(1);
  };

  // 6. Compute raw metrics
  const weight = result.inputs.weight;
  const height = result.inputs.height;
  const sex = result.inputs.sex;
  const pulse = result.inputs.pulse;
  const finalSbp = result.inputs.sbp;
  const finalDbp = result.inputs.dbp;
  const spo2 = result.inputs.spo2;
  const temperature = result.inputs.temperature;
  const bloodGlucose = result.inputs.bloodGlucose;

  // BMI & BSA
  if (weight !== null && height !== null) {
    const height_m = height / 100;
    const bmiVal = weight / (height_m * height_m);
    result.metrics.bmi = {
      raw: bmiVal,
      display: formatDisplay(bmiVal),
      category: null,
      severity: null,
    };

    const bsaVal = Math.sqrt((height * weight) / 3600);
    result.metrics.bsa = {
      raw: bsaVal,
      display: formatDisplay(bsaVal),
      category: null,
      severity: null,
    };
  }

  // MAP & Pulse Pressure
  let finalMap = null;
  if (finalSbp !== null && finalDbp !== null) {
    const mapVal = finalDbp + (finalSbp - finalDbp) / 3;
    finalMap = mapVal;
    result.metrics.map = {
      raw: mapVal,
      display: formatDisplay(mapVal),
      category: null,
      severity: null,
    };

    const ppVal = finalSbp - finalDbp;
    result.metrics.pulsePressure = {
      raw: ppVal,
      display: formatDisplay(ppVal),
      category: null,
      severity: null,
    };
  }

  // Shock Index
  if (pulse !== null && finalSbp !== null) {
    const siVal = pulse / finalSbp;
    result.metrics.shockIndex = {
      raw: siVal,
      display: formatDisplay(siVal),
      category: null,
      severity: null,
    };
  }

  // IBW (Devine Formula)
  if (height !== null && sex !== null) {
    const heightInches = height / 2.54;
    if (heightInches <= 60) {
      result.metrics.ibw = {
        raw: null,
        display: "N/A (height below formula range)",
        category: null,
        severity: null,
      };
    } else {
      const baseWeight = sex === "M" ? 50 : 45.5;
      const ibwVal = baseWeight + 2.3 * (heightInches - 60);
      result.metrics.ibw = {
        raw: ibwVal,
        display: formatDisplay(ibwVal),
        category: null,
        severity: null,
      };
    }
  }

  // BMR (Mifflin-St Jeor Formula)
  if (weight !== null && height !== null && age !== null && sex !== null) {
    const baseOffset = sex === "M" ? 5 : -161;
    const bmrVal = 10 * weight + 6.25 * height - 5 * age + baseOffset;
    result.metrics.bmr = {
      raw: bmrVal,
      display: formatDisplay(bmrVal),
      category: null,
      severity: null,
    };
  }

  // 7. Assemble one-line raw vitals summary
  const summaryParts = [];
  if (rawAge !== null) summaryParts.push(`Age ${rawAge} yr`);
  if (rawSex !== null) summaryParts.push(`Sex ${rawSex === "M" ? "Male" : "Female"}`);
  if (finalSbp !== null && finalDbp !== null) summaryParts.push(`BP ${finalSbp}/${finalDbp} mmHg`);
  else if (finalSbp !== null) summaryParts.push(`SBP ${finalSbp} mmHg`);
  if (finalDbp !== null) summaryParts.push(`DBP ${finalDbp} mmHg`);
  if (spo2 !== null) summaryParts.push(`SpO₂ ${spo2}%`);
  if (pulse !== null) summaryParts.push(`Pulse ${pulse} bpm`);
  if (temperature !== null) summaryParts.push(`Temp ${temperature.toFixed(1)} °F`);
  if (bloodGlucose !== null) summaryParts.push(`Blood Glucose ${bloodGlucose.toFixed(1)} mg/dL`);
  if (weight !== null) summaryParts.push(`Weight ${weight.toFixed(1)} kg`);
  if (height !== null) summaryParts.push(`Height ${height.toFixed(1)} cm`);

  const vitalsSummary = `Raw vitals summary: ${summaryParts.join(", ")}.`;

  // 7.5 Generate Indian Dietary Recommendations (Applies to both Adult and Pediatric)
  const diet = [];

  // Hypertension
  if (!result.isPediatric && ((finalSbp !== null && finalSbp > 130) || (finalDbp !== null && finalDbp > 80))) {
    diet.push("Include potassium-rich foods like tender coconut water, moong dal, and bottle gourd (lauki). Avoid high-sodium items like pickles, papad, and salted snacks.");
  }

  // Blood Glucose
  if (bloodGlucose !== null && bloodGlucose > 140) {
    diet.push("Opt for low-glycemic foods such as ragi or millet dosa, bitter gourd (karela), and fenugreek (methi). Avoid refined sugar, sweets, and white rice.");
  }

  // Fever / High Temp
  if (temperature !== null && temperature > 99.5) {
    diet.push("Consume easily digestible, hydrating foods like moong dal khichdi, rasam, rice kanji, and tulsi-ginger tea.");
  }

  // BMI Check
  const bmiVal = result.metrics.bmi?.raw;
  if (!result.isPediatric && bmiVal !== null && bmiVal !== undefined) {
    if (bmiVal < 18.5) {
      diet.push("Include nutrient-dense foods to support healthy weight gain, such as cow's ghee, paneer, mixed nuts, sweet potato, and whole milk.");
    } else if (bmiVal >= 25) {
      diet.push("Focus on high-fiber, low-calorie options like sprouts salad, dal cheela, oats upma, and plain buttermilk (chaas). Limit deep-fried snacks.");
    }
  }

  // SpO2
  if (spo2 !== null && spo2 < 95) {
    diet.push("Incorporate iron and Vitamin C-rich foods to support oxygen transport, such as amla (Indian gooseberry), spinach (palak), beetroot, and jaggery.");
  }

  // Default healthy
  if (diet.length === 0) {
    diet.push("Maintain a balanced diet with a variety of fresh vegetables, lentils, and whole grains. Stay well hydrated throughout the day.");
  }

  result.dietRecommendations = diet;

  // 8. Pediatric Guard Exit - Bypasses interpretation and sorting
  if (result.isPediatric) {
    result.interpretationParagraph = `${vitalsSummary} ${result.pediatricNote}`;
    return result;
  }

  // 9. Apply Clinical Decision Support rules (Adult only)
  const firedRules = [];

  if (Array.isArray(rules) && rules.length > 0) {
    const values = {
      age: result.inputs.age,
      sex: result.inputs.sex,
      sbp: result.inputs.sbp,
      dbp: result.inputs.dbp,
      weight: result.inputs.weight,
      height: result.inputs.height,
      spo2: result.inputs.spo2,
      pulse: result.inputs.pulse,
      temperature: result.inputs.temperature,
      bloodGlucose: result.inputs.bloodGlucose,
      bmi: result.metrics.bmi.raw,
      bsa: result.metrics.bsa.raw,
      map: result.metrics.map.raw,
      pulsePressure: result.metrics.pulsePressure.raw,
      shockIndex: result.metrics.shockIndex.raw,
      ibw: result.metrics.ibw.raw,
      bmr: result.metrics.bmr.raw,
    };

    const activeRules = rules.filter(r => r.isActive);

    const matchesOperator = (operator, val, low, high) => {
      if (val === null || val === undefined) return false;
      const numVal = Number(val);
      const numLow = low != null ? Number(low) : null;
      const numHigh = high != null ? Number(high) : null;

      if (operator === 'lt') return numHigh != null && numVal < numHigh;
      if (operator === 'lte') return numHigh != null && numVal <= numHigh;
      if (operator === 'gt') return numLow != null && numVal > numLow;
      if (operator === 'gte') return numLow != null && numVal >= numLow;
      if (operator === 'eq') return numLow != null && numVal === numLow;
      if (operator === 'between') return numLow != null && numHigh != null && numVal >= numLow && numVal <= numHigh;
      return false;
    };

    // Evaluate single-metric rules
    const singleRules = activeRules.filter(r => r.ruleType === 'single');
    const evaluatedMetrics = {};

    singleRules.forEach(rule => {
      const metricName = rule.metric?.toLowerCase();
      if (!metricName) return;

      const val = values[metricName];
      if (val === null || val === undefined) return;

      if (matchesOperator(rule.operator, val, rule.thresholdLow, rule.thresholdHigh)) {
        const current = evaluatedMetrics[metricName];
        const weightNew = SEVERITY_WEIGHTS[rule.severity] || 0;
        const weightCurrent = current ? (SEVERITY_WEIGHTS[current.severity] || 0) : -1;

        if (!current || weightNew > weightCurrent) {
          evaluatedMetrics[metricName] = {
            label: rule.label,
            severity: rule.severity,
            text: rule.outputText,
            sortHint: rule.sortHint
          };
        }
      }
    });

    // Assign categories and severities to result.metrics and push to firedRules
    if (evaluatedMetrics.bmi) {
      result.metrics.bmi.category = evaluatedMetrics.bmi.label;
      result.metrics.bmi.severity = evaluatedMetrics.bmi.severity;
      firedRules.push({
        metric: "BMI",
        label: evaluatedMetrics.bmi.label,
        severity: evaluatedMetrics.bmi.severity,
        text: evaluatedMetrics.bmi.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.bmi.sortHint
      });
    }

    if (evaluatedMetrics.spo2) {
      firedRules.push({
        metric: "SpO2",
        label: evaluatedMetrics.spo2.label,
        severity: evaluatedMetrics.spo2.severity,
        text: evaluatedMetrics.spo2.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.spo2.sortHint
      });
    }

    if (evaluatedMetrics.pulse) {
      firedRules.push({
        metric: "Pulse",
        label: evaluatedMetrics.pulse.label,
        severity: evaluatedMetrics.pulse.severity,
        text: evaluatedMetrics.pulse.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.pulse.sortHint
      });
    }

    if (evaluatedMetrics.temperature) {
      firedRules.push({
        metric: "Temperature",
        label: evaluatedMetrics.temperature.label,
        severity: evaluatedMetrics.temperature.severity,
        text: evaluatedMetrics.temperature.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.temperature.sortHint
      });
    }

    if (evaluatedMetrics.shockindex) {
      result.metrics.shockIndex.category = evaluatedMetrics.shockindex.label;
      result.metrics.shockIndex.severity = evaluatedMetrics.shockindex.severity;
      firedRules.push({
        metric: "Shock Index",
        label: evaluatedMetrics.shockindex.label,
        severity: evaluatedMetrics.shockindex.severity,
        text: evaluatedMetrics.shockindex.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.shockindex.sortHint
      });
    }

    if (evaluatedMetrics.pulsepressure) {
      result.metrics.pulsePressure.category = evaluatedMetrics.pulsepressure.label;
      result.metrics.pulsePressure.severity = evaluatedMetrics.pulsepressure.severity;
      firedRules.push({
        metric: "Pulse Pressure",
        label: evaluatedMetrics.pulsepressure.label,
        severity: evaluatedMetrics.pulsepressure.severity,
        text: evaluatedMetrics.pulsepressure.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.pulsepressure.sortHint
      });
    }

    if (evaluatedMetrics.map) {
      result.metrics.map.category = evaluatedMetrics.map.label;
      result.metrics.map.severity = evaluatedMetrics.map.severity;
      firedRules.push({
        metric: "MAP",
        label: evaluatedMetrics.map.label,
        severity: evaluatedMetrics.map.severity,
        text: evaluatedMetrics.map.text,
        ruleType: 'single',
        sortHint: evaluatedMetrics.map.sortHint
      });
    }

    // Evaluate combination rules
    const combinationRules = activeRules.filter(r => r.ruleType === 'combination');
    const bpOptions = [];

    combinationRules.forEach(rule => {
      if (rule.metric?.toLowerCase() !== 'bp') return;
      const condition = rule.conditionExpr;
      if (!condition) return;

      try {
        const fn = new Function('{ sbp, dbp, map, bmi, spo2, pulse, shockIndex, pulsePressure, age, temperature }', `return ${condition};`);
        const matched = fn(values);
        if (matched) {
          bpOptions.push({
            label: rule.label,
            severity: rule.severity,
            text: rule.outputText,
            weight: SEVERITY_WEIGHTS[rule.severity] || 0,
            sortHint: rule.sortHint
          });
        }
      } catch (e) {
        console.error("Error executing rule condition_expr:", condition, e);
      }
    });

    if (bpOptions.length > 0) {
      bpOptions.sort((a, b) => b.weight - a.weight);
      const chosenBP = bpOptions[0];

      if (result.metrics.map.raw !== null) {
        result.metrics.map.category = chosenBP.label;
        result.metrics.map.severity = chosenBP.severity;
      }
      if (result.metrics.pulsePressure.raw !== null) {
        result.metrics.pulsePressure.category = chosenBP.label;
        result.metrics.pulsePressure.severity = chosenBP.severity;
      }

      firedRules.push({
        metric: "Blood Pressure",
        label: chosenBP.label,
        severity: chosenBP.severity,
        text: chosenBP.text,
        ruleType: 'combination',
        sortHint: chosenBP.sortHint
      });
    }

    // Evaluate non-BP combination rules (C1-C8)
    const nonBpCombinationRules = combinationRules.filter(r => r.metric?.toLowerCase() !== 'bp');
    const firedCombinationRules = [];

    nonBpCombinationRules.forEach(rule => {
      // Skip C8 "No acute hemodynamic or respiratory concern" for now
      if (rule.label === "No acute hemodynamic or respiratory concern" || rule.conditionExpr?.includes("concern")) {
        return;
      }

      const condition = rule.conditionExpr;
      if (!condition) return;

      try {
        const fn = new Function('{ sbp, dbp, map, bmi, spo2, pulse, shockIndex, pulsePressure, age, temperature }', `return ${condition};`);
        const matched = fn(values);
        if (matched) {
          firedCombinationRules.push({
            metric: "Combination",
            label: rule.label,
            severity: rule.severity,
            text: rule.outputText,
            ruleType: 'combination',
            sortHint: rule.sortHint
          });
        }
      } catch (e) {
        console.error("Error executing rule condition_expr:", condition, e);
      }
    });

    // Check if any critical/warning combination rule fired
    const anyCriticalOrWarningCombinationFired = 
      bpOptions.some(bp => bp.severity === 'critical' || bp.severity === 'warning') ||
      firedCombinationRules.some(cr => cr.severity === 'critical' || cr.severity === 'warning');

    // If none fired, evaluate C8
    if (!anyCriticalOrWarningCombinationFired) {
      const c8Rule = nonBpCombinationRules.find(r => r.label === "No acute hemodynamic or respiratory concern" || r.conditionExpr?.includes("concern"));
      if (c8Rule) {
        const condition = c8Rule.conditionExpr;
        try {
          const fn = new Function('{ sbp, dbp, map, bmi, spo2, pulse, shockIndex, pulsePressure, age, temperature }', `return ${condition};`);
          const matched = fn(values);
          if (matched) {
            firedCombinationRules.push({
              metric: "Combination",
              label: c8Rule.label,
              severity: c8Rule.severity,
              text: c8Rule.outputText,
              ruleType: 'combination',
              sortHint: c8Rule.sortHint
            });
          }
        } catch (e) {
          console.error("Error executing C8 condition_expr:", condition, e);
        }
      }
    }

    firedRules.push(...firedCombinationRules);
  }

  // 10. Sort fired rules by severity (critical -> warning -> info -> reassurance)
  // Within same severity level, combination rules come BEFORE single-metric rules.
  firedRules.sort((a, b) => {
    const weightA = SEVERITY_WEIGHTS[a.severity] || 0;
    const weightB = SEVERITY_WEIGHTS[b.severity] || 0;
    if (weightA !== weightB) {
      return weightB - weightA;
    }
    
    const typeWeightA = a.ruleType === 'combination' ? 2 : 1;
    const typeWeightB = b.ruleType === 'combination' ? 2 : 1;
    if (typeWeightA !== typeWeightB) {
      return typeWeightB - typeWeightA;
    }
    
    const hintA = a.sortHint ?? 999;
    const hintB = b.sortHint ?? 999;
    return hintA - hintB;
  });

  result.firedRules = firedRules;

  // 11. Compile output paragraph
  const interpretationSentences = firedRules.map((r) => r.text).join(" ");
  result.interpretationParagraph = interpretationSentences
    ? `${vitalsSummary} ${interpretationSentences}`
    : vitalsSummary;
  return result;
}
