import { Hono } from 'hono';
import { fetchMexcKlines, fetchFearAndGreed, fetchCoinGeckoBTC365d, fetchAltcoinSeasonIndex, fetchMvrv, fetchNupl, fetchSopr, fetchCBBI } from './api';
import { calculateMA, calculateRSI, evaluateIndicators } from './calc';

const app = new Hono();

app.get('/api/data', async (c) => {
  try {
    const env = c.env as Record<string, string>;
    const bgeometricsKey = env?.BGEOMETRICS_API_KEY || '';

    // 1. Fetch data
    const [btc90d, fearAndGreed, btc365d, mvrvRes, nuplRes, soprRes, cbbi] = await Promise.all([
      fetchMexcKlines('BTCUSDT', '1d', 90),
      fetchFearAndGreed(),
      fetchCoinGeckoBTC365d(),
      fetchMvrv(bgeometricsKey),
      fetchNupl(bgeometricsKey),
      fetchSopr(bgeometricsKey),
      fetchCBBI()
    ]);

    const mvrv = mvrvRes.val;
    const nupl = nuplRes.val;
    const sopr = soprRes.val;

    const currentPrice = btc90d[btc90d.length - 1];

    // 2. Indicators
    const ma60 = calculateMA(btc90d, 60);
    const ma60Deviation = (currentPrice - ma60) / ma60;
    
    const rsi14 = calculateRSI(btc90d, 14);

    let puellMultiple = 1.0;
    let ma111 = 0;
    let ma350 = 0;
    if (btc365d && btc365d.length > 0) {
      const ma365 = calculateMA(btc365d, 365);
      if (ma365 > 0) {
        puellMultiple = currentPrice / ma365;
      }
      ma111 = calculateMA(btc365d, 111);
      ma350 = calculateMA(btc365d, 350);
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
      mvrv,
      nupl,
      sopr,
      cbbi,
      ma111,
      ma350
    });

    // 4. Return JSON
    const payload = {
      price: currentPrice,
      rsi14: rsi14.toFixed(2),
      ma60Deviation: (ma60Deviation * 100).toFixed(2) + '%',
      fearAndGreed,
      puellMultiple: puellMultiple.toFixed(2),
      mvrv: mvrv !== null ? mvrv.toFixed(2) : (mvrvRes.err ? `Err: ${mvrvRes.err}` : '--'),
      nupl: nupl !== null ? nupl.toFixed(2) : (nuplRes.err ? `Err: ${nuplRes.err}` : '--'),
      sopr: sopr !== null ? sopr.toFixed(2) : (soprRes.err ? `Err: ${soprRes.err}` : '--'),
      cbbi: cbbi !== null ? cbbi : '--',
      piCycleTriggered: evaluation.details.isPiCycleTop,
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
            <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">BTC 全景链上共振模型</h1>
            <p class="text-slate-400">十维全景监控雷达 | 抄底与逃顶双轨引擎</p>
        </header>

        <div id="loading" class="text-center text-xl text-cyan-400 my-20">正在同步链上数据与市场指标...</div>

        <div id="dashboard" class="hidden">
            <!-- Top section: Signal & Price -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="cyber-card p-6 flex flex-col items-center justify-center" id="bottom-signal-card">
                    <h2 class="text-lg text-slate-400 mb-2 flex items-center">🟢 抄底雷达</h2>
                    <div id="bottom-rating" class="text-4xl font-black mb-4 uppercase text-slate-500">持币观望</div>
                    <div id="bottom-trigger-count" class="text-sm px-3 py-1 bg-slate-700 rounded-full">0 / 8 底部指标达标</div>
                </div>
                <div class="cyber-card p-6 flex flex-col items-center justify-center" id="top-signal-card">
                    <h2 class="text-lg text-slate-400 mb-2 flex items-center">🔴 逃顶雷达</h2>
                    <div id="top-rating" class="text-4xl font-black mb-4 uppercase text-green-500">安全</div>
                    <div id="top-trigger-count" class="text-sm px-3 py-1 bg-slate-700 rounded-full">0 / 6 逃顶指标触发</div>
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
                    <div class="text-xs">底部: < 30 / 顶部: > 80</div>
                </div>
                <!-- Puell Multiple -->
                <div class="cyber-card p-5" id="card-puell">
                    <div class="text-xs text-slate-400 mb-1">普尔倍数 (近况)</div>
                    <div class="text-2xl font-bold mb-2" id="val-puell">--</div>
                    <div class="text-xs">底部: < 0.5 / 顶部: > 3.0</div>
                </div>
                <!-- MVRV -->
                <div class="cyber-card p-5" id="card-mvrv">
                    <div class="text-xs text-slate-400 mb-1">MVRV 估值</div>
                    <div class="text-2xl font-bold mb-2" id="val-mvrv">--</div>
                    <div class="text-xs">底部: < 1.0 / 顶部: > 3.7</div>
                </div>
                <!-- NUPL -->
                <div class="cyber-card p-5" id="card-nupl">
                    <div class="text-xs text-slate-400 mb-1">NUPL (净未实现利润)</div>
                    <div class="text-2xl font-bold mb-2" id="val-nupl">--</div>
                    <div class="text-xs">底部: < 0 / 顶部: > 0.75</div>
                </div>
                <!-- SOPR -->
                <div class="cyber-card p-5" id="card-sopr">
                    <div class="text-xs text-slate-400 mb-1">SOPR (已花费输出利润率)</div>
                    <div class="text-2xl font-bold mb-2" id="val-sopr">--</div>
                    <div class="text-xs">阈值: < 1.0 触发</div>
                </div>
                <!-- CBBI -->
                <div class="cyber-card p-5" id="card-cbbi">
                    <div class="text-xs text-slate-400 mb-1">CBBI 牛熊指数</div>
                    <div class="text-2xl font-bold mb-2" id="val-cbbi">--</div>
                    <div class="text-xs">底部: < 15 / 顶部: > 80</div>
                </div>
                <!-- Pi Cycle Top -->
                <div class="cyber-card p-5" id="card-pi">
                    <div class="text-xs text-slate-400 mb-1">Pi Cycle Top 预警</div>
                    <div class="text-2xl font-bold mb-2" id="val-pi">安全</div>
                    <div class="text-xs">111DMA > 350DMA×2 时告警</div>
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
                        <p><span class="text-yellow-400">看盘指南：</span>当指数跌破 30，市场进入极度恐慌的绝望期，适合买入；反之当指数 > 80，市场极度贪婪，风险加剧，触发逃顶预警。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>3. 普尔倍数 (Puell Multiple)</span>
                            <a href="https://www.lookintobitcoin.com/charts/puell-multiple/" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 LookIntoBitcoin</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>普尔倍数衡量的是每天比特币产出价值与过去365天平均值的比率。由于矿工有硬性的法币开支（电费、矿机），这是一个底层逻辑极强的矿工指标。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>当指标跌破 0.5 时，意味着全网矿工在痛苦割肉，往往对应周期大底；当指标 > 3.0，矿工暴利，抛压极大，往往对应历史大顶。</p>
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
                            <span>5. MVRV 估值指标 (Market Value to Realized Value)</span>
                            <a href="https://charts.bgeometrics.com/dashboard_trend_dark.html" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 BGeometrics 图表</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>衡量全网比特币当前总市值与“已实现市值”的比率。它直观反映了市场的平均浮盈/浮亏状态。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>当指标 < 1.0 时，市场整体处于“浮亏”状态，属于长周期极佳定投建仓区；当指标 > 3.7 时，市场浮盈极大，泡沫随时破裂。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>6. NUPL (Net Unrealized Profit/Loss)</span>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>衡量全网筹码的净未实现利润与亏损状态，偏向情绪指标。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>跌破 0 意味着大面积亏损，恐慌情绪达到冰点；突破 0.75 意味着市场极度贪婪，进入“亢奋”状态（Euphoria），随时见顶。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>7. SOPR (Spent Output Profit Ratio)</span>
                            <a href="https://charts.bgeometrics.com/dashboard_trend_dark.html" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 BGeometrics 图表</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>计算当日在链上转移的 BTC 相比上次移动的盈亏情况。判断抛压是止盈还是割肉。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>持续 < 1 说明人们在割肉。熊市末期极佳建仓区。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>8. CBBI (综合牛市指数)</span>
                            <a href="https://cbbi.info/" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 flex items-center">🔗 CBBI 官网</a>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>整合多个顶级链上指标的综合得分 (0-100)，避免单一指标失效。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>< 15 提示深熊极度低估；> 80 提示狂暴牛市见顶风险。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>9. Pi Cycle Top</span>
                        </h4>
                        <p><span class="text-cyan-400">原理：</span>当短期均线 (111日) 疯狂拉升上穿长期均线乘数 (350日×2) 时，历史周期均在此附近见顶。</p>
                        <p><span class="text-yellow-400">看盘指南：</span>属于纯粹的“危险报警器”，警报响起时应考虑清仓逃顶。</p>
                    </div>
                    <div class="border-l-2 border-slate-600 pl-4">
                        <h4 class="font-bold text-slate-100 text-base mb-1 flex items-center justify-between">
                            <span>10. 山寨季指数 (Altcoin Season Index)</span>
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
                // Add version parameter to bypass old edge cache
                const res = await fetch('/api/data?v=3.0');
                const data = await res.json();
                
                if(data.error) {
                    document.getElementById('loading').innerText = '数据加载失败: ' + data.error;
                    return;
                }

                // Client-side CBBI fallback (if Cloudflare Worker was blocked)
                if (data.cbbi === '--') {
                    try {
                        const cbbiRes = await fetch('https://colintalkscrypto.com/cbbi/data/latest.json');
                        const cbbiData = await cbbiRes.json();
                        if (cbbiData && cbbiData.Confidence) {
                            const keys = Object.keys(cbbiData.Confidence);
                            const lastKey = keys[keys.length - 1];
                            data.cbbi = Math.round(cbbiData.Confidence[lastKey] * 100);
                            
                            // Adjust glowing logic client-side
                            if (data.cbbi < 15) {
                                data.evaluation.details.isCbbiBottom = true;
                            } else if (data.cbbi > 80) {
                                data.evaluation.details.isCbbiTop = true;
                            }
                        }
                    } catch(e) {
                        console.error('Frontend CBBI fetch failed', e);
                    }
                }

                // Client-side BGeometrics fallback (if Cloudflare Worker was rate-limited)
                async function fallbackBGeometrics(key, url, formatter) {
                    if (data[key] && data[key].toString().startsWith('Err:')) {
                        try {
                            const res = await fetch(url);
                            if (res.ok) {
                                const list = await res.json();
                                if (list && list.length > 0) {
                                    data[key] = formatter(list[list.length - 1]);
                                }
                            }
                        } catch(e) {
                            console.error(`Frontend ${key} fetch failed`, e);
                        }
                    }
                }
                
                await fallbackBGeometrics('mvrv', 'https://api.bgeometrics.com/v1/mvrv', item => item.mvrv.toFixed(2));
                await fallbackBGeometrics('nupl', 'https://api.bgeometrics.com/v1/nupl', item => item.nupl.toFixed(2));
                await fallbackBGeometrics('sopr', 'https://api.bgeometrics.com/v1/sopr', item => item.sopr.toFixed(2));

                document.getElementById('loading').style.display = 'none';
                document.getElementById('dashboard').classList.remove('hidden');

                // Fill values
                document.getElementById('btc-price').innerText = '$' + data.price.toLocaleString();
                document.getElementById('val-rsi').innerText = data.rsi14;
                document.getElementById('val-ma').innerText = data.ma60Deviation;
                document.getElementById('val-fear').innerText = data.fearAndGreed;
                document.getElementById('val-puell').innerText = data.puellMultiple;
                // helper to elegantly show error: normal users see "--", devs can hover for error info
                function renderValueOrError(id, valStr) {
                    const el = document.getElementById(id);
                    if (valStr && valStr.toString().startsWith('Err:')) {
                        let rawErr = valStr.toString().replace('Err: ', '');
                        let displayErr = rawErr;
                        if (rawErr.includes('429')) displayErr = '请求被限流 (' + rawErr + ')';
                        else if (rawErr.includes('401') || rawErr.includes('403')) displayErr = 'API权限受限 (' + rawErr + ')';
                        else if (rawErr.includes('API_KEY Missing')) displayErr = '未配置 API Key';

                        el.innerHTML = '-- ' +
                            '<div class="relative inline-block group ml-2">' +
                            '<span class="text-sm text-red-500/80 font-normal cursor-help">⚠️</span>' +
                            '<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-xs bg-slate-800 text-slate-200 text-xs rounded py-1 px-2 border border-slate-600 shadow-lg z-50">' +
                            displayErr +
                            '</div></div>';
                    } else {
                        el.innerText = valStr;
                    }
                }

                renderValueOrError('val-mvrv', data.mvrv);
                renderValueOrError('val-nupl', data.nupl);
                renderValueOrError('val-sopr', data.sopr);
                document.getElementById('val-cbbi').innerText = data.cbbi;
                document.getElementById('val-pi').innerText = data.piCycleTriggered ? '⚠️ 极度危险' : '安全';
                if (data.piCycleTriggered) {
                    document.getElementById('val-pi').classList.replace('text-white', 'text-red-500');
                    document.getElementById('card-pi').classList.add('glow-red');
                }
                
                document.getElementById('alt-season').innerText = '山寨季指数 (前20): ' + data.altcoinSeasonIndex;
                document.getElementById('update-time').innerText = new Date(data.timestamp).toLocaleString();

                const eval = data.evaluation;
                
                // Bottom Rating
                const bRatingEl = document.getElementById('bottom-rating');
                const bSignalCard = document.getElementById('bottom-signal-card');
                if (eval.bottomRating === '强力买入') {
                    bRatingEl.innerText = '强力买入';
                    bRatingEl.className = "text-4xl font-black mb-4 uppercase text-green-400";
                    bSignalCard.classList.add('glow-green');
                } else if (eval.bottomRating === '分批定投') {
                    bRatingEl.innerText = '分批定投';
                    bRatingEl.className = "text-4xl font-black mb-4 uppercase text-yellow-400";
                    bSignalCard.classList.add('glow-green');
                } else {
                    bRatingEl.innerText = '持币观望';
                    bRatingEl.className = "text-4xl font-black mb-4 uppercase text-slate-500";
                    bSignalCard.classList.remove('glow-green');
                }
                
                // Top Rating
                const tRatingEl = document.getElementById('top-rating');
                const tSignalCard = document.getElementById('top-signal-card');
                if (eval.topRating === '极度危险') {
                    tRatingEl.innerText = '极度危险';
                    tRatingEl.className = "text-4xl font-black mb-4 uppercase text-red-600";
                    tSignalCard.classList.add('glow-red');
                } else if (eval.topRating === '顶部预警') {
                    tRatingEl.innerText = '顶部预警';
                    tRatingEl.className = "text-4xl font-black mb-4 uppercase text-red-400";
                    tSignalCard.classList.add('glow-red');
                } else {
                    tRatingEl.innerText = '安全';
                    tRatingEl.className = "text-4xl font-black mb-4 uppercase text-green-500";
                    tSignalCard.classList.remove('glow-red');
                }
                
                document.getElementById('bottom-trigger-count').innerText = eval.triggers + ' / 8 底部指标达标';
                document.getElementById('top-trigger-count').innerText = eval.topWarnings + ' / 6 逃顶指标触发';

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
                const applyGlow = (id, isBottomTriggered, isTopTriggered) => {
                    const el = document.getElementById(id);
                    if(isBottomTriggered) {
                        el.classList.add('glow-green');
                        el.querySelector('.text-2xl').classList.add('text-green-400');
                    } else if (isTopTriggered) {
                        el.classList.add('glow-red');
                        el.querySelector('.text-2xl').classList.add('text-red-500');
                    } else {
                        el.querySelector('.text-2xl').classList.add('text-white');
                    }
                };

                applyGlow('card-rsi', eval.details.isRsiTriggered, false);
                applyGlow('card-ma', eval.details.isMaTriggered, false);
                applyGlow('card-fear', eval.details.isFearTriggered, eval.details.isFearTop);
                applyGlow('card-puell', eval.details.isPuellTriggered, eval.details.isPuellTop);
                applyGlow('card-mvrv', eval.details.isMvrvTriggered, eval.details.isMvrvTop);
                applyGlow('card-nupl', eval.details.isNuplTriggered, eval.details.isNuplTop);
                applyGlow('card-sopr', eval.details.isSoprTriggered, false);
                applyGlow('card-cbbi', eval.details.isCbbiBottom, eval.details.isCbbiTop);

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
