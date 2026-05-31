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
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📈</text></svg>">
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
            
            <div class="text-center text-xs text-slate-500 mb-8">更新时间: <span id="update-time"></span></div>

            <!-- Glossary Section -->
            <div class="cyber-card p-6 mt-8 mb-8">
                <h3 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-4 flex items-center">
                    <svg class="w-6 h-6 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    监控指标百科 (Model Glossary)
                </h3>
                <div class="space-y-4 text-sm text-slate-300">
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>1. 60日均线偏离度 (MA60 Deviation)</span>
                            <a href="https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 查看图表</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>均线是用来算账的。当当下价格大幅度低于60天前的平均持仓成本时，意味着短线情绪彻底崩溃，跌出了“黄金坑”。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>正常震荡市中偏离度在 ±5% 左右。一旦偏离度跌破 -15%，说明价格已处于绝对低位，触发买入信号。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>2. 恐慌贪婪指数 (Fear & Greed Index)</span>
                            <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 数据源</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>该指数结合了波动率、市场动能、社交媒体等多种数据。巴菲特说过“别人恐惧我贪婪”。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>当指数跌破 30，市场进入人人自危的恐慌期，适合开始关注；跌破 10 则是极度恐慌的绝望期，胜率极高，必须坚决买入。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>3. 普尔倍数 (Puell Multiple)</span>
                            <a href="https://www.lookintobitcoin.com/charts/puell-multiple/" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 LookIntoBitcoin</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>普尔倍数衡量的是每天比特币产出价值与过去365天平均值的比率。由于矿工有硬性的法币开支（电费、矿机），这是一个底层逻辑极强的矿工底线指标。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>当指标跌破 0.5 时，意味着全网矿工在痛苦割肉，往往对应着几十年不遇的周期大底部。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>4. 日线 RSI (14)</span>
                            <a href="https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 查看图表</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>相对强弱指数，反映价格涨跌的动能。像弹簧一样，压得越狠，反弹力越强。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>跌破 35 即进入超卖状态。历史上 90% 的日线级别严重超卖，随后都会迎来 20% 以上的强力反弹。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>5. 山寨季指数 (Altcoin Season Index)</span>
                            <a href="https://www.blockchaincenter.net/en/altcoin-season-index/" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 官方指数网站</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>衡量排名前20的主流山寨币在过去 90 天内跑赢比特币的比例。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>如果在高位(>75)，说明山寨群魔乱舞，随时可能崩盘，此时有买点也应该买大饼避险；如果在极低的底部(<25)，说明山寨泡沫挤干，此时买入主流山寨币将获得超高的翻倍弹性。</p>
                    </div>
                </div>
            </div>
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
