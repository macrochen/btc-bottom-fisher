export function calculateMA(prices: number[], periods: number): number {
  if (prices.length < periods) return 0;
  const slice = prices.slice(prices.length - periods);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / periods;
}

export function calculateRSI(prices: number[], periods = 14): number {
  if (prices.length <= periods) return 50;

  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= periods; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / periods;
  let avgLoss = losses / periods;

  // Smoothed Moving Average for subsequent periods
  for (let i = periods + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (periods - 1) + diff) / periods;
      avgLoss = (avgLoss * (periods - 1)) / periods;
    } else {
      avgGain = (avgGain * (periods - 1)) / periods;
      avgLoss = (avgLoss * (periods - 1) - diff) / periods;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function evaluateIndicators(data: {
  rsi: number;
  ma60Deviation: number;
  fearAndGreed: number;
  puellMultiple: number;
  mvrv: number | null;
  nupl: number | null;
  sopr: number | null;
  cbbi: number | null;
  ma111: number;
  ma350: number;
}) {
  let triggers = 0;
  let topWarnings = 0;

  // 1. RSI < 35 (Super oversold)
  const isRsiTriggered = data.rsi < 35;
  if (isRsiTriggered) triggers++;

  // 2. MA60 Deviation < -15% (Extreme deviation from 60d MA)
  const isMaTriggered = data.ma60Deviation < -0.15;
  if (isMaTriggered) triggers++;

  // 3. Fear and Greed < 30
  const isFearTriggered = data.fearAndGreed < 30;
  if (isFearTriggered) triggers++;

  // 4. Puell Multiple < 0.5 (Miner bottom line)
  const isPuellTriggered = data.puellMultiple < 0.5;
  if (isPuellTriggered) triggers++;

  // 5. MVRV < 1.0 (Value bottom line)
  const isMvrvTriggered = data.mvrv !== null && data.mvrv < 1.0;
  if (isMvrvTriggered) triggers++;

  // 6. NUPL < 0 (Net loss)
  const isNuplTriggered = data.nupl !== null && data.nupl < 0;
  if (isNuplTriggered) triggers++;

  // 7. SOPR < 1.0 (Selling at a loss)
  const isSoprTriggered = data.sopr !== null && data.sopr < 1.0;
  if (isSoprTriggered) triggers++;

  // --- Top Warnings ---
  const isPiCycleTop = data.ma111 > 0 && data.ma350 > 0 && data.ma111 > (data.ma350 * 2);
  if (isPiCycleTop) topWarnings++;

  const isCbbiTop = data.cbbi !== null && data.cbbi > 80;
  if (isCbbiTop) topWarnings++;
  
  const isCbbiBottom = data.cbbi !== null && data.cbbi < 15;
  if (isCbbiBottom) triggers++;

  let rating = "Wait";
  if (topWarnings > 0) {
    rating = "Top Warning";
  } else if (triggers >= 6) {
    rating = "Strong Buy";
  } else if (triggers >= 4) {
    rating = "Accumulate";
  }

  return {
    triggers,
    rating,
    details: {
      isRsiTriggered,
      isMaTriggered,
      isFearTriggered,
      isPuellTriggered,
      isMvrvTriggered,
      isNuplTriggered,
      isSoprTriggered,
      isPiCycleTop,
      isCbbiTop,
      isCbbiBottom,
    }
  };
}
