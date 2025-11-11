import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';

/**
 * Mint helper UI — router‑aware (OpenSea/SeaDrop, Creator, Launchpads)
 *
 * Highlights:
 * - Supports **router-style** mint functions (first arg `address nft`) and direct NFT mint.
 * - Accepts **Launchpad/Router** and **NFT Contract** addresses separately.
 * - EIP‑1559 fee handling (maxFeePerGas / maxPriorityFeePerGas) with low/normal/high multipliers.
 * - Chain auto-detect from RPC + proper block explorer links.
 * - ABI fetcher for many Etherscan-family explorers (or paste ABI manually).
 * - Safety filters: skip functions that clearly require allowlist proof/signature.
 */

const CHAIN_META = /** @type {Record<number, {name:string,symbol:string,explorer:string,scanApi?:string}>} */ ({
  1:   { name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io',         scanApi: 'https://api.etherscan.io/api' },
  5:   { name: 'Goerli',   symbol: 'ETH', explorer: 'https://goerli.etherscan.io',  scanApi: 'https://api-goerli.etherscan.io/api' },
  11155111: { name: 'Sepolia', symbol: 'ETH', explorer: 'https://sepolia.etherscan.io', scanApi: 'https://api-sepolia.etherscan.io/api' },
  10:  { name: 'OP Mainnet', symbol: 'ETH', explorer: 'https://optimistic.etherscan.io', scanApi: 'https://api-optimistic.etherscan.io/api' },
  420: { name: 'OP Goerli', symbol: 'ETH', explorer: 'https://goerli-optimism.etherscan.io' },
  8453:{ name: 'Base', symbol: 'ETH', explorer: 'https://basescan.org',            scanApi: 'https://api.basescan.org/api' },
  84531:{ name: 'Base Goerli', symbol: 'ETH', explorer: 'https://goerli.basescan.org' },
  42161:{ name: 'Arbitrum One', symbol: 'ETH', explorer: 'https://arbiscan.io',    scanApi: 'https://api.arbiscan.io/api' },
  421614:{ name: 'Arbitrum Sepolia', symbol: 'ETH', explorer: 'https://sepolia.arbiscan.io' },
  137: { name: 'Polygon', symbol: 'MATIC', explorer: 'https://polygonscan.com',    scanApi: 'https://api.polygonscan.com/api' },
  80002:{ name: 'Polygon Amoy', symbol: 'MATIC', explorer: 'https://amoy.polygonscan.com' },
});

const guessSymbol = (chainId) => CHAIN_META[chainId]?.symbol || 'ETH';
const getExplorerUrl = (chainId, txHash) => `${CHAIN_META[chainId]?.explorer || 'https://etherscan.io'}/tx/${txHash}`;

async function detectChainFromRPC(rpcUrl){
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  return { chainId, name: CHAIN_META[chainId]?.name || `Chain ${chainId}`, symbol: guessSymbol(chainId) };
}

function isAddressLike(v=''){ try{ return !!ethers.getAddress(v.trim()); }catch{ return false; } }

// Fetch ABI from Etherscan family; if apiKey omitted, many endpoints still work for public ABIs
async function fetchAbiFromExplorer(chainId, address, apiKey){
  const base = CHAIN_META[chainId]?.scanApi;
  if(!base) throw new Error(`No explorer API configured for chainId ${chainId}`);
  const url = new URL(base);
  url.searchParams.set('module','contract');
  url.searchParams.set('action','getabi');
  url.searchParams.set('address', address);
  if(apiKey) url.searchParams.set('apikey', apiKey);
  const res = await fetch(url.toString());
  if(!res.ok) throw new Error(`Explorer API HTTP ${res.status}`);
  const data = await res.json();
  if(data.status !== '1') throw new Error(data.result || 'Failed to fetch ABI');
  return JSON.parse(data.result);
}

// Very small heuristic to choose a mint function from an ABI
function detectMintSignature(abi){
  const fns = abi.filter(i => i.type === 'function')
                 .filter(i => /mint|claim/i.test(i.name || ''));
  if(fns.length === 0) return null;

  // Prefer router-like: first arg is address (nft)
  const routerLike = fns.find(f => (f.inputs?.length||0) >= 1 && f.inputs[0].type === 'address');
  if(routerLike) return { fn: routerLike, style: 'router' };

  // Direct with quantity
  const directQty = fns.find(f => (f.inputs?.length||0) === 1 && f.inputs[0].type === 'uint256');
  if(directQty) return { fn: directQty, style: 'directQty' };

  // Direct no-arg
  const direct0 = fns.find(f => (f.inputs?.length||0) === 0);
  if(direct0) return { fn: direct0, style: 'direct0' };

  // Otherwise first mint-like
  return { fn: fns[0], style: 'unknown' };
}

// Quick check if function obviously needs allowlist proof/signature
function looksAllowlistOnly(inputs){
  const types = (inputs||[]).map(x=>x.type);
  if(types.some(t => /bytes32\[\]|bytes|signature/i.test(t))) return true;
  // many allowlist functions include multiple time/price/nonce params
  const manyNums = types.filter(t=>t.startsWith('uint')).length >= 3;
  return manyNums;
}

function useLogs(){
  const [logs, setLogs] = useState([]);
  const push = (type, message) => setLogs(prev => [...prev, { ts: new Date().toISOString(), type, message }]);
  const clear = () => setLogs([]);
  return { logs, push, clear };
}

export default function App(){
  const { logs, push, clear } = useLogs();

  const [config, setConfig] = useState({
    rpcUrl: '',
    explorerApiKey: '', // optional (Etherscan/Basescan/Polygonscan/etc)
    launchpadContractAddress: '', // router / creator / SeaDrop
    nftContractAddress: '',
    privateKeys: '', // one per line
    gasLevel: 'normal', // low | normal | high
    mintPriceEth: '0', // send value per mint
    quantity: 1,
    manualLaunchpadAbi: '',
    manualNftAbi: '',
  });

  const [chain, setChain] = useState({ chainId: 0, name: '', symbol: 'ETH' });
  const [wallets, setWallets] = useState([]); // {address, pk, lastTx, status}
  const [busy, setBusy] = useState(false);

  const canScan = useMemo(()=>{
    return !!config.rpcUrl && (isAddressLike(config.launchpadContractAddress) || isAddressLike(config.nftContractAddress));
  }, [config]);

  async function onDetectChain(){
    try{
      const info = await detectChainFromRPC(config.rpcUrl);
      setChain(info);
      push('info', `RPC connected → ${info.name} (chainId=${info.chainId})`);
    }catch(err){
      push('error', `RPC error: ${err.message}`);
    }
  }

  function parseKeys(){
    return config.privateKeys.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  }

  async function loadAbis(){
    const out = { launchpadAbi: null, nftAbi: null };
    try{
      if(config.manualLaunchpadAbi.trim()) out.launchpadAbi = JSON.parse(config.manualLaunchpadAbi);
      if(config.manualNftAbi.trim()) out.nftAbi = JSON.parse(config.manualNftAbi);
    }catch(e){ throw new Error('Manual ABI JSON invalid'); }

    const needLaunchpad = !out.launchpadAbi && isAddressLike(config.launchpadContractAddress);
    const needNft       = !out.nftAbi && isAddressLike(config.nftContractAddress);
    if(!CHAIN_META[chain.chainId]) push('warn', `Explorer API not known for chainId ${chain.chainId}; paste ABI manually if fetch fails.`);

    if(needLaunchpad){
      try{
        out.launchpadAbi = await fetchAbiFromExplorer(chain.chainId, config.launchpadContractAddress, config.explorerApiKey);
        push('info', `Fetched ABI (launchpad)`);
      }catch(e){ push('warn', `Launchpad ABI fetch failed: ${e.message}`); }
    }
    if(needNft){
      try{
        out.nftAbi = await fetchAbiFromExplorer(chain.chainId, config.nftContractAddress, config.explorerApiKey);
        push('info', `Fetched ABI (NFT)`);
      }catch(e){ push('warn', `NFT ABI fetch failed: ${e.message}`); }
    }
    return out;
  }

  async function scan(){
    clear();
    if(!canScan){ push('error','Lengkapi RPC & salah satu alamat kontrak.'); return; }
    try{
      if(!chain.chainId) await onDetectChain();
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const { launchpadAbi, nftAbi } = await loadAbis();

      let targetAbi = null, style = 'direct0', selectedFn = null;

      // Prefer router first if available
      if(launchpadAbi){
        const sig = detectMintSignature(launchpadAbi);
        if(sig){
          targetAbi = launchpadAbi; style = sig.style; selectedFn = sig.fn;
          push('info', `Mint (launchpad): ${sig.fn.name} [${sig.style}]`);
        }
      }
      // Fallback to NFT
      if(!selectedFn && nftAbi){
        const sig = detectMintSignature(nftAbi);
        if(sig){ targetAbi = nftAbi; style = sig.style; selectedFn = sig.fn; push('info', `Mint (NFT): ${sig.fn.name} [${sig.style}]`); }
      }

      if(!selectedFn){
        push('error','Tidak menemukan fungsi mint/claim pada ABI. Paste ABI manual atau pastikan kontrak benar.');
        return;
      }

      if(style === 'router' && looksAllowlistOnly(selectedFn.inputs)){
        push('warn','Fungsi router terdeteksi tampaknya butuh allowlist proof/signature. Mode ini hanya mendukung Public Mint.');
      }

      // Prepare wallets view
      const pks = parseKeys();
      const list = pks.map(pk=>{
        try{
          const wallet = new ethers.Wallet(pk);
          return { address: wallet.address, pk, status: 'READY', lastTx: null };
        }catch{ return { address: 'Invalid PK', pk, status: 'ERROR_PK', lastTx: null }; }
      });
      setWallets(list);

      // Fee preview
      const fee = await provider.getFeeData();
      push('info', `Fee data: maxFeePerGas=${fee.maxFeePerGas?.toString()||'n/a'}, gasPrice=${fee.gasPrice?.toString()||'n/a'}`);

    }catch(err){
      push('error', `Scan error: ${err.message}`);
    }
  }

  function multPct(bn, pct){ return (bn * BigInt(pct)) / 100n; }

  async function startMinting(){
    if(busy) return;
    if(!chain.chainId){ push('error','Detect chain dulu.'); return; }

    setBusy(true);
    try{
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const qty = Math.max(1, Number(config.quantity||1));
      const valuePer = ethers.parseEther((config.mintPriceEth||'0').toString());

      const { launchpadAbi, nftAbi } = await loadAbis();

      // Decide style again (robust against state changes)
      let style = 'direct0', targetAbi = null, selectedFn = null, targetAddress = null;
      if(launchpadAbi){ const sig = detectMintSignature(launchpadAbi); if(sig){ style=sig.style; targetAbi=launchpadAbi; selectedFn=sig.fn; targetAddress=config.launchpadContractAddress; } }
      if(!selectedFn && nftAbi){ const sig = detectMintSignature(nftAbi); if(sig){ style=sig.style; targetAbi=nftAbi; selectedFn=sig.fn; targetAddress=config.nftContractAddress; } }
      if(!selectedFn) throw new Error('Tidak menemukan fungsi mint/claim apapun');

      // Build static args template based on style (will adjust per-wallet if needed)
      const wantsFeeRecipient = selectedFn.inputs?.[1]?.type === 'address' && style === 'router';

      // Iterate wallets
      const pks = parseKeys();
      for(const pk of pks){
        let statusPrefix = '';
        try{
          const wallet = new ethers.Wallet(pk, provider);
          statusPrefix = wallet.address.slice(0,8);

          const feeData = await provider.getFeeData();
          const overrides = {};
          if(feeData.maxFeePerGas && feeData.maxPriorityFeePerGas){
            let mf = feeData.maxFeePerGas, mp = feeData.maxPriorityFeePerGas;
            if(config.gasLevel==='high'){ mf = multPct(mf,120); mp = multPct(mp,120); }
            if(config.gasLevel==='low'){  mf = multPct(mf,80);  mp = multPct(mp,80); }
            overrides.maxFeePerGas = mf; overrides.maxPriorityFeePerGas = mp;
          }else if(feeData.gasPrice){
            let gp = feeData.gasPrice; if(config.gasLevel==='high') gp = multPct(gp,120); if(config.gasLevel==='low') gp = multPct(gp,80); overrides.gasPrice = gp;
          }

          const totalValue = valuePer * BigInt(qty);
          overrides.value = totalValue;

          // Construct args
          let args = [];
          if(style === 'router'){
            if(!isAddressLike(config.launchpadContractAddress) || !isAddressLike(config.nftContractAddress)) throw new Error('Alamat router/NFT belum valid');
            if(wantsFeeRecipient){
              // Common: mint(address nft, address feeRecipient, uint256 quantity)
              args = [config.nftContractAddress, wallet.address, BigInt(qty)];
            }else{
              // Common: mint(address nft, uint256 quantity)
              args = [config.nftContractAddress, BigInt(qty)];
            }
          }else if(style==='directQty'){
            if(!isAddressLike(config.nftContractAddress)) throw new Error('Alamat NFT belum valid');
            args = [BigInt(qty)];
            targetAddress = config.nftContractAddress;
          }else{ // direct0 or unknown
            if(!isAddressLike(config.nftContractAddress)) throw new Error('Alamat NFT belum valid');
            args = [];
            targetAddress = config.nftContractAddress;
          }

          // If function looks like allowlist-only, bail with message instead of wasting gas
          if(looksAllowlistOnly(selectedFn.inputs)){
            push('warn', `${statusPrefix} • Fungsi tampak perlu allowlist/signature → lewati (hanya public mint didukung).`);
            continue;
          }

          const contract = new ethers.Contract(targetAddress, targetAbi, wallet);

          // Gas estimate v6
          try{
            const est = await contract.estimateGas[selectedFn.name](...args, overrides);
            overrides.gasLimit = multPct(est, 120); // buffer 20%
          }catch(e){
            overrides.gasLimit = 300000n; // fallback
          }

          const tx = await contract[selectedFn.name](...args, overrides);
          push('info', `${statusPrefix} • sent → ${tx.hash}`);
          const rc = await tx.wait();
          push('success', `${statusPrefix} • confirmed in block ${rc.blockNumber} → ${getExplorerUrl(chain.chainId, tx.hash)}`);
        }catch(err){
          push('error', `${statusPrefix} • ${err.message || String(err)}`);
        }
      }

    }catch(err){
      push('error', `Mint error: ${err.message}`);
    }finally{
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 16, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Multi‑Launchpad Mint (Router‑Aware)</h1>
      <p style={{ opacity: .8, marginTop: 4 }}>Dukung mint via kontrak Router/Creator (mis. OpenSea SeaDrop) atau langsung ke NFT jika dibolehkan.</p>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        <div>
          <label>RPC URL</label>
          <input value={config.rpcUrl} onChange={e=>setConfig({...config, rpcUrl:e.target.value})} placeholder="https://..." style={s.input}/>
          <button onClick={onDetectChain} style={s.btn}>Detect Chain</button>
          {chain.chainId!==0 && (
            <div style={{ marginTop: 6, fontSize: 13 }}>Chain: <b>{chain.name}</b> • Symbol: {chain.symbol} • chainId: {chain.chainId}</div>
          )}
        </div>
        <div>
          <label>Explorer API Key (opsional)</label>
          <input value={config.explorerApiKey} onChange={e=>setConfig({...config, explorerApiKey:e.target.value})} placeholder="Etherscan/Basescan/Polygonscan key" style={s.input}/>
          <small style={{opacity:.7}}>Dipakai untuk fetch ABI. Kalau kosong, tetap dicoba (banyak kontrak publik berhasil).</small>
        </div>

        <div>
          <label>Launchpad / Router Address</label>
          <input value={config.launchpadContractAddress} onChange={e=>setConfig({...config, launchpadContractAddress:e.target.value.trim()})} placeholder="0x... (SeaDrop/Creator/Router)" style={s.input}/>
        </div>
        <div>
          <label>NFT Contract Address</label>
          <input value={config.nftContractAddress} onChange={e=>setConfig({...config, nftContractAddress:e.target.value.trim()})} placeholder="0x... (ERC721/1155)" style={s.input}/>
        </div>

        <div>
          <label>Private Keys (satu per baris)</label>
          <textarea value={config.privateKeys} onChange={e=>setConfig({...config, privateKeys:e.target.value})} placeholder="0xabc...\n0xdef..." style={s.ta}/>
        </div>
        <div>
          <label>Mint Price per mint (ETH)</label>
          <input value={config.mintPriceEth} onChange={e=>setConfig({...config, mintPriceEth:e.target.value})} placeholder="0" style={s.input}/>
          <label style={{marginTop:8}}>Quantity per wallet</label>
          <input type="number" min={1} value={config.quantity} onChange={e=>setConfig({...config, quantity: Number(e.target.value)})} style={s.input}/>
          <label style={{marginTop:8}}>Gas Level</label>
          <select value={config.gasLevel} onChange={e=>setConfig({...config, gasLevel:e.target.value})} style={s.input}>
            <option value="low">Low (−20%)</option>
            <option value="normal">Normal</option>
            <option value="high">High (+20%)</option>
          </select>
        </div>

        <div>
          <label>Manual ABI — Launchpad/Router (opsional)</label>
          <textarea value={config.manualLaunchpadAbi} onChange={e=>setConfig({...config, manualLaunchpadAbi:e.target.value})} placeholder="Paste JSON ABI kalau fetch gagal" style={s.taSmall}/>
        </div>
        <div>
          <label>Manual ABI — NFT (opsional)</label>
          <textarea value={config.manualNftAbi} onChange={e=>setConfig({...config, manualNftAbi:e.target.value})} placeholder="Paste JSON ABI kalau fetch gagal" style={s.taSmall}/>
        </div>
      </section>

      <div style={{ display:'flex', gap:8, marginTop: 10 }}>
        <button onClick={scan} disabled={!canScan} style={s.btn}>Scan</button>
        <button onClick={startMinting} disabled={busy} style={s.btnPrimary}>{busy? 'Minting...' : 'Start Minting'}</button>
      </div>

      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize:16, fontWeight:700 }}>Wallets</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
          {wallets.map((w, i)=> (
            <div key={i} style={s.card}>
              <div style={{fontFamily:'ui-monospace, SFMono-Regular',fontSize:12}}>{w.address}</div>
              {w.lastTx && (
                <a href={getExplorerUrl(chain.chainId, w.lastTx)} rel="noreferrer" target="_blank">View TX →</a>
              )}
              <div style={{fontSize:12, opacity:.7}}>Status: {w.status}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize:16, fontWeight:700 }}>Logs</h3>
        <div style={s.logBox}>
          {logs.map((l, i)=> (
            <div key={i} style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular', fontSize:11, opacity:.6 }}>{new Date(l.ts).toLocaleTimeString()}</span>
              <span style={{ marginLeft:8, fontWeight:600, textTransform:'uppercase', fontSize:11, color: colorFor(l.type) }}>{l.type}</span>
              <div style={{ marginTop:2 }}>{linkify(l.message)}</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ margin:'24px 0', fontSize:12, opacity:.7 }}>
        ⚠️ Hanya mendukung Public Mint. Jika fungsi membutuhkan allowlist proof/signature, aplikasi akan melewatinya.
      </footer>
    </div>
  );
}

const colorFor = (t)=> t==='error'?'#c62828': t==='success'?'#2e7d32': t==='warn'?'#f9a825':'#1976d2';

const linkify = (text='')=>{
  const url = /(https?:\/\/[^\s]+)/g; 
  const parts = String(text).split(url);
  return parts.map((p,i)=> url.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : <span key={i}>{p}</span>);
};

const s = {
  input: { width:'100%', padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, marginTop:4 },
  ta: { width:'100%', minHeight:140, padding:10, border:'1px solid #ddd', borderRadius:8, marginTop:4, fontFamily:'ui-monospace, SFMono-Regular' },
  taSmall: { width:'100%', minHeight:90, padding:10, border:'1px solid #ddd', borderRadius:8, marginTop:4, fontFamily:'ui-monospace, SFMono-Regular' },
  btn: { padding:'8px 12px', border:'1px solid #ddd', borderRadius:10, background:'#fff', cursor:'pointer' },
  btnPrimary: { padding:'8px 12px', border:'1px solid #0059ff', borderRadius:10, background:'#0d6efd', color:'#fff', cursor:'pointer' },
  card: { border:'1px solid #eee', borderRadius:10, padding:10, background:'#fafafa' },
  logBox: { border:'1px solid #eee', borderRadius:10, maxHeight:320, overflow:'auto' },
};
