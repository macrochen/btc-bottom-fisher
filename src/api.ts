export const ALTCOINS = [
  "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOGE", "DOT", "LINK", "MATIC",
  "SHIB", "LTC", "UNI", "BCH", "XLM", "NEAR", "APT", "ARB", "OP", "ATOM"
];

export async function fetchMexcKlines(symbol: string, interval: string, limit: number) {
  const url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  if (!res.ok) throw new Error(`MEXC API error: ${res.status}`);
  const data = await res.json() as any[][];
  return data.map(candle => parseFloat(candle[4])); // closing prices
}

export async function fetchFearAndGreed() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1');
  if (!res.ok) throw new Error('Alternative.me API error');
  const data = await res.json() as any;
  return parseInt(data.data[0].value, 10);
}

export async function fetchCoinGeckoBTC365d() {
  const res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  });
  if (!res.ok) {
    // If coingecko fails (e.g. rate limit), return empty to fallback to Binance daily fetching if we want
    console.warn(`CoinGecko API error: ${res.status}`);
    return [];
  }
  const data = await res.json() as any;
  return data.prices.map((p: any) => p[1] as number);
}

export async function fetchAltcoinSeasonIndex(btc90dReturn: number) {
  let beatBtcCount = 0;
  let totalCount = 0;
  
  const promises = ALTCOINS.map(async (coin) => {
    try {
      const prices = await fetchMexcKlines(`${coin}USDT`, '1d', 90);
      if (prices.length >= 80) {
        const p1 = prices[0];
        const p2 = prices[prices.length - 1];
        const ret = (p2 - p1) / p1;
        return ret;
      }
    } catch (e) {
      // Ignore delisted or failing pairs
    }
    return null;
  });

  const returns = await Promise.all(promises);
  for (const r of returns) {
    if (r !== null) {
      totalCount++;
      if (r > btc90dReturn) {
        beatBtcCount++;
      }
    }
  }

  if (totalCount === 0) return 50; // fallback neutral
  return Math.round((beatBtcCount / totalCount) * 100);
}

export async function fetchMvrv(apiKey?: string) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.bgeometrics.com/v1/mvrv?api_key=${apiKey}`);
    if (!res.ok) throw new Error(`BGeometrics API error: ${res.status}`);
    const data = await res.json() as any[];
    if (data && data.length > 0) {
      // BGeometrics returns array of { d: '2022-06-06', unixTs: 1654473600, mvrv: 1.3394 }
      // Get the latest one
      const latest = data[data.length - 1];
      return latest.mvrv as number;
    }
  } catch (e) {
    console.warn('Failed to fetch MVRV:', e);
  }
  return null;
}

export async function fetchNupl(apiKey?: string) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.bgeometrics.com/v1/nupl?api_key=${apiKey}`);
    if (!res.ok) throw new Error(`BGeometrics NUPL error: ${res.status}`);
    const data = await res.json() as any[];
    if (data && data.length > 0) {
      return data[data.length - 1].nupl as number;
    }
  } catch (e) {
    console.warn('Failed to fetch NUPL:', e);
  }
  return null;
}

export async function fetchSopr(apiKey?: string) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.bgeometrics.com/v1/sopr?api_key=${apiKey}`);
    if (!res.ok) throw new Error(`BGeometrics SOPR error: ${res.status}`);
    const data = await res.json() as any[];
    if (data && data.length > 0) {
      return data[data.length - 1].sopr as number;
    }
  } catch (e) {
    console.warn('Failed to fetch SOPR:', e);
  }
  return null;
}

export async function fetchCBBI() {
  try {
    const res = await fetch('https://colintalkscrypto.com/cbbi/data/latest.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`CBBI API error: ${res.status}`);
    const data = await res.json() as any;
    if (data && data.Confidence) {
      const keys = Object.keys(data.Confidence);
      if (keys.length > 0) {
        const latestKey = keys[keys.length - 1];
        return Math.round(data.Confidence[latestKey] * 100);
      }
    }
  } catch (e) {
    console.warn('Failed to fetch CBBI:', e);
  }
  return null;
}
