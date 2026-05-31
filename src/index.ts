import { Hono } from 'hono';
import { fetchBinanceKlines, fetchFearAndGreed, fetchCoinGeckoBTC365d, fetchAltcoinSeasonIndex } from './api';
import { calculateMA, calculateRSI, evaluateIndicators } from './calc';

const app = new Hono();

app.get('/api/data', async (c) => {
  try {
    // 1. Fetch data
    const [btc90d, fearAndGreed, btc365d] = await Promise.all([
      fetchBinanceKlines('BTCUSDT', '1d', 90),
      fetchFearAndGreed(),
      fetchCoinGeckoBTC365d()
    ]);

    const currentPrice = btc90d[btc90d.length - 1];

    // 2. Indicators
    const ma60 = calculateMA(btc90d, 60);
    const ma60Deviation = (currentPrice - ma60) / ma60;
    
    const rsi14 = calculateRSI(btc90d, 14);

    let puellMultiple = 1.0;
    if (btc365d && btc365d.length > 0) {
      const ma365 = calculateMA(btc365d, 365);
      if (ma365 > 0) {
        puellMultiple = currentPrice / ma365;
      }
    } else {
      puellMultiple = currentPrice / ma60; // Fallback
    }

    const btc90dStart = btc90d[0];
    const btc90dReturn = (currentPrice - btc90dStart) / btc90dStart;
    const altcoinSeasonIndex = await fetchAltcoinSeasonIndex(btc90dReturn);

    // 3. Evaluate
    const evaluation = evaluateIndicators({
      rsi: rsi14,
      ma60Deviation,
      fearAndGreed,
      puellMultiple,
    });

    // 4. Return JSON
    const payload = {
      price: currentPrice,
      rsi14: rsi14.toFixed(2),
      ma60Deviation: (ma60Deviation * 100).toFixed(2) + '%',
      fearAndGreed,
      puellMultiple: puellMultiple.toFixed(2),
      altcoinSeasonIndex,
      evaluation,
      timestamp: new Date().toISOString()
    };

    // Cache the response at edge for 1 hour to prevent hitting free APIs limits
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json(payload);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/', (c) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>比特币“黄金坑”监控仪</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; }
        .cyber-card { background: rgba(30, 41, 59, 0.7); border: 1px solid #334155; backdrop-filter: blur(10px); border-radius: 12px; }
        .glow-green { box-shadow: 0 0 15px rgba(34, 197, 94, 0.5); border-color: #22c55e; }
        .glow-red { box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); border-color: #ef4444; }
    </style>
</head>
<body class="min-h-screen p-6">
    <div class="max-w-5xl mx-auto">
        <header class="mb-8 text-center">
            <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">BTC 黄金坑监控雷达</h1>
            <p class="text-slate-400">四维共振抄底模型 | 全自动实时抓取</p>
        </header>

        <div id="loading" class="text-center text-xl text-cyan-400 my-20">正在同步链上数据与市场指标...</div>

        <div id="dashboard" class="hidden">
            <!-- Top section: Signal & Price -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="cyber-card p-6 flex flex-col items-center justify-center" id="signal-card">
                    <h2 class="text-lg text-slate-400 mb-2">终极操作建议</h2>
                    <div id="rating" class="text-5xl font-black mb-4 uppercase">WAIT</div>
                    <div id="trigger-count" class="text-sm px-3 py-1 bg-slate-700 rounded-full"></div>
                </div>
                <div class="cyber-card p-6 flex flex-col items-center justify-center">
                    <h2 class="text-lg text-slate-400 mb-2">比特币当前价格</h2>
                    <div id="btc-price" class="text-5xl font-bold text-white mb-4">$0.00</div>
                    <div id="alt-season" class="text-sm text-cyan-400">山寨季指数: --</div>
                    <div id="alt-action" class="mt-2 text-sm text-yellow-400 text-center px-4"></div>
                </div>
            </div>

            <!-- Indicators Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <!-- RSI -->
                <div class="cyber-card p-5" id="card-rsi">
                    <div class="text-xs text-slate-400 mb-1">日线 RSI (14)</div>
                    <div class="text-2xl font-bold mb-2" id="val-rsi">--</div>
                    <div class="text-xs">阈值: < 35 触发</div>
                </div>
                <!-- MA Deviation -->
                <div class="cyber-card p-5" id="card-ma">
                    <div class="text-xs text-slate-400 mb-1">60日均线偏离度</div>
                    <div class="text-2xl font-bold mb-2" id="val-ma">--</div>
                    <div class="text-xs">阈值: < -15% 触发</div>
                </div>
                <!-- Fear & Greed -->
                <div class="cyber-card p-5" id="card-fear">
                    <div class="text-xs text-slate-400 mb-1">恐慌贪婪指数</div>
                    <div class="text-2xl font-bold mb-2" id="val-fear">--</div>
                    <div class="text-xs">阈值: < 30 触发</div>
                </div>
                <!-- Puell Multiple -->
                <div class="cyber-card p-5" id="card-puell">
                    <div class="text-xs text-slate-400 mb-1">普尔倍数 (近况)</div>
                    <div class="text-2xl font-bold mb-2" id="val-puell">--</div>
                    <div class="text-xs">阈值: < 0.5 触发</div>
                </div>
            </div>
            
            <div class="text-center text-xs text-slate-500">更新时间: <span id="update-time"></span></div>
        </div>
    </div>

    <script>
        async function loadData() {
            try {
                const res = await fetch('/api/data');
                const data = await res.json();
                
                if(data.error) {
                    document.getElementById('loading').innerText = '数据加载失败: ' + data.error;
                    return;
                }

                document.getElementById('loading').classList.add('hidden');
                document.getElementById('dashboard').classList.remove('hidden');

                // Fill values
                document.getElementById('btc-price').innerText = '$' + data.price.toLocaleString();
                document.getElementById('val-rsi').innerText = data.rsi14;
                document.getElementById('val-ma').innerText = data.ma60Deviation;
                document.getElementById('val-fear').innerText = data.fearAndGreed;
                document.getElementById('val-puell').innerText = data.puellMultiple;
                document.getElementById('alt-season').innerText = '山寨季指数 (前20): ' + data.altcoinSeasonIndex;
                document.getElementById('update-time').innerText = new Date(data.timestamp).toLocaleString();

                const eval = data.evaluation;
                const r = eval.rating;
                const ratingEl = document.getElementById('rating');
                const signalCard = document.getElementById('signal-card');
                
                ratingEl.innerText = r === 'Strong Buy' ? '强力买入' : (r === 'Accumulate' ? '定投吸筹' : '持币观望');
                document.getElementById('trigger-count').innerText = eval.triggers + ' / 4 指标达标';

                if (r === 'Strong Buy') {
                    ratingEl.className = "text-5xl font-black mb-4 uppercase text-green-400";
                    signalCard.classList.add('glow-green');
                } else if (r === 'Accumulate') {
                    ratingEl.className = "text-5xl font-black mb-4 uppercase text-yellow-400";
                } else {
                    ratingEl.className = "text-5xl font-black mb-4 uppercase text-slate-500";
                }

                // Altcoin logic
                const altAction = document.getElementById('alt-action');
                if (data.altcoinSeasonIndex > 75) {
                    altAction.innerText = '⚠️ 山寨指数高位：群魔乱舞，优先买入大饼避险！';
                } else if (data.altcoinSeasonIndex < 25) {
                    altAction.innerText = '💡 山寨泡沫挤干：建议重点布局市值前20的主流山寨币！';
                } else {
                    altAction.innerText = '当前为中间震荡区，均衡配置。';
                }

                // Cards styling
                const applyGlow = (id, isTriggered) => {
                    const el = document.getElementById(id);
                    if(isTriggered) {
                        el.classList.add('glow-green');
                        el.querySelector('.text-2xl').classList.add('text-green-400');
                    } else {
                        el.querySelector('.text-2xl').classList.add('text-white');
                    }
                };

                applyGlow('card-rsi', eval.details.isRsiTriggered);
                applyGlow('card-ma', eval.details.isMaTriggered);
                applyGlow('card-fear', eval.details.isFearTriggered);
                applyGlow('card-puell', eval.details.isPuellTriggered);

            } catch(e) {
                document.getElementById('loading').innerText = '网络错误';
            }
        }
        loadData();
    </script>
</body>
</html>
  `;
  return c.html(html);
});

export default app;
