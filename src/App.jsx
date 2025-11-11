// App.jsx — SeaDrop/Launchpad Mint Bot (robust preflight + fallback)
// (c) 2025 — improved to handle unsupported chains (e.g., ApeChain 33139)
import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap } from 'lucide-react';

// expects ethers exposed on window
const ethers = window.ethers;

const OpenSeaAutoMint = () => {
  const [config, setConfig] = useState({
    launchpadUrl: '',
    contractAddress: '',
    rpcUrl: '',
    privateKeys: '',
    gasLevel: 'normal',
    useSeaDrop: true,
    seaDropAddress: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
    feeRecipient: '',
    quantityPerWallet: 1,
  });

  const [mintPhases, setMintPhases] = useState({ public: true, whitelist: false, allowlist: false });
  const [advancedOptions, setAdvancedOptions] = useState({ autoRetry: true, sniperMode: false, flashbots: false });

  const [wallets, setWallets] = useState([]);
  const [scannedWallets, setScannedWallets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintStats, setMintStats] = useState({ success: 0, failed: 0, total: 0 });
  const [mintPrice, setMintPrice] = useState('0');
  const [estimatedGas, setEstimatedGas] = useState('0');
  const [detectedChain, setDetectedChain] = useState('');
  const [chainSymbol, setChainSymbol] = useState('ETH');
  const [chainId, setChainId] = useState(1);

  const [contractABI, setContractABI] = useState(null);
  const [mintFunctionName, setMintFunctionName] = useState('');
  const [mintFunctionHasQuantity, setMintFunctionHasQuantity] = useState(false);

  const [seaDropUsable, setSeaDropUsable] = useState(false); // NEW: result of preflight
  const [seaDropRestrictsRecipients, setSeaDropRestrictsRecipients] = useState(false);

  const logsEndRef = useRef(null);

  // ---------- ethers v5/v6 compatibility ----------
  const isV6 = (() => { try { return ethers?.version?.startsWith?.('6'); } catch { return false; } })();
  const makeProvider = (url) => isV6 ? new ethers.JsonRpcProvider(url) : new ethers.providers.JsonRpcProvider(url);
  const toWei = (ethStr) => isV6 ? ethers.parseEther(ethStr) : ethers.utils.parseEther(ethStr);
  const fmtEth = (wei) => isV6 ? ethers.formatEther(wei) : ethers.utils.formatEther(wei);
  const getGasPrice = async (provider) => {
    const fee = await provider.getFeeData();
    return isV6 ? (fee.gasPrice ?? 0n) : BigInt(fee.gasPrice?.toString() || '0');
  };
  const bnToBigInt = (x) => (typeof x === 'bigint' ? x : BigInt(x.toString()));

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const parsePrivateKeys = (keys) => keys.split('\n').map(k => k.trim()).filter(k => k && k.startsWith('0x')).slice(0, 10);
  const extractContractAddress = (url) => (String(url || '').match(/0x[a-fA-F0-9]{40}/)?.[0] || url);

  const detectChainFromRPC = async (rpcUrl) => {
    try {
      const provider = makeProvider(rpcUrl);
      const network = await provider.getNetwork();
      const cid = Number(isV6 ? network.chainId : network.chainId);
      const chains = {
        1: { name: 'Ethereum Mainnet', symbol: 'ETH' },
        137: { name: 'Polygon', symbol: 'MATIC' },
        42161: { name: 'Arbitrum One', symbol: 'ETH' },
        10: { name: 'Optimism', symbol: 'ETH' },
        8453: { name: 'Base', symbol: 'ETH' },
        11155111: { name: 'Sepolia', symbol: 'ETH' },
        5: { name: 'Goerli', symbol: 'ETH' },
      };
      const c = chains[cid] || { name: `Chain ID: ${cid}`, symbol: 'ETH' };
      return { name: c.name, symbol: c.symbol, chainId: cid };
    } catch (e) {
      addLog(`❌ Failed to detect chain: ${e.message}`, 'error');
      return { name: 'Unknown Chain', symbol: 'ETH', chainId: 0 };
    }
  };

  // --- ABIs ---
  const genericAbi = () => ([
    "function mint() payable",
    "function publicMint() payable",
    "function mint(uint256) payable",
    "function publicMint(uint256) payable",
    "function whitelistMint() payable",
    "function allowlistMint() payable",
    "function mintPrice() view returns (uint256)",
    "function cost() view returns (uint256)",
    "function price() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
  ]);

  const seaDropAbi = [
    "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable",
    "function getPublicDrop(address nftContract) view returns (tuple(uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
    "function getCreatorPayoutAddress(address nftContract) view returns (address)",
    "function getFeeRecipientIsAllowed(address nftContract, address feeRecipient) view returns (bool)"
  ];

  const detectMintFunction = (abi) => {
    const arr = Array.isArray(abi) ? abi : [];
    const funcs = arr.filter(i => i?.type === 'function' || typeof i === 'string');
    const by = (name, params = 0) =>
      funcs.find(f => typeof f === 'string'
        ? f.toLowerCase().startsWith(`${name.toLowerCase()}(`) && ((params === 0) ? !/uint256\)/i.test(f) : /uint256\)/i.test(f))
        : f?.name === name && ((f?.inputs?.length || 0) === params));
    let f = by('publicMint', 0) || by('mint', 0) || by('whitelistMint', 0) || by('allowlistMint', 0) || by('claim', 0);
    if (f) return { name: typeof f === 'string' ? f.split('(')[0] : f.name, hasQuantity: false };
    const fq = funcs.find(f => (typeof f === 'string' && /uint256\)/i.test(f)) || (f?.inputs?.length === 1 && f.inputs[0].type === 'uint256'));
    return { name: typeof fq === 'string' ? fq.split('(')[0] : fq?.name || 'mint', hasQuantity: !!fq };
  };

  // --- Helpers: ABIs + prices ---
  const getContractABI = async (contractAddress, chainId) => {
    const api = {
      1: 'https://api.etherscan.io/api',
      11155111: 'https://api-sepolia.etherscan.io/api',
      137: 'https://api.polygonscan.com/api',
      42161: 'https://api.arbiscan.io/api',
      10: 'https://api-optimistic.etherscan.io/api',
      8453: 'https://api.basescan.org/api',
    }[chainId];
    if (!api) return genericAbi();
    try {
      const res = await fetch(`${api}?module=contract&action=getabi&address=${contractAddress}`);
      const data = await res.json();
      if (data.status === '1' && data.result) return JSON.parse(data.result);
    } catch { /* ignore */ }
    return genericAbi();
  };

  const getMintPriceGeneric = async (provider, contractAddress, abi) => {
    try {
      const c = new ethers.Contract(contractAddress, abi, provider);
      for (const g of ['mintPrice', 'cost', 'price', 'getMintPrice']) {
        try {
          const p = await c[g]();
          return fmtEth(p);
        } catch {}
      }
    } catch {}
    return '0';
  };

  // ---- SeaDrop preflight (NEW) ----
  const knownSeaDropChains = new Set([1, 137, 42161, 10, 8453]); // eth, polygon, arbitrum, optimism, base

  const preflightSeaDrop = async (provider, seaDropAddr, nftContractAddr) => {
    // 1) code check
    const code = await provider.getCode(seaDropAddr);
    if (!code || code === '0x') {
      return { usable: false, reason: 'SeaDrop not deployed on this chain' };
    }

    // 2) read public drop
    try {
      const seaDrop = new ethers.Contract(seaDropAddr, seaDropAbi, provider);
      const pub = await seaDrop.getPublicDrop(nftContractAddr);
      const priceWei = isV6 ? BigInt(pub.mintPrice ?? pub[0]) : BigInt(pub[0].toString());
      const start = Number(isV6 ? (pub.startTime ?? pub[1]) : pub[1].toString());
      const end = Number(isV6 ? (pub.endTime ?? pub[2]) : pub[2].toString());
      const restrict = Boolean(isV6 ? (pub.restrictFeeRecipients ?? pub[5]) : pub[5]);

      const now = Math.floor(Date.now()/1000);
      if (!start || !end || now < start || now > end) {
        return { usable: false, reason: 'Public drop not active on SeaDrop' };
      }
      if (priceWei < 0n) {
        return { usable: false, reason: 'Invalid mint price' };
      }
      return { usable: true, priceEth: fmtEth(priceWei), restrictFeeRecipients: restrict };
    } catch (e) {
      return { usable: false, reason: `SeaDrop read failed: ${e.message}` };
    }
  };

  const resolveSeaDropFeeRecipient = async (provider, seaDropAddr, nftContractAddr, userInput) => {
    try {
      const seaDrop = new ethers.Contract(seaDropAddr, seaDropAbi, provider);
      if (userInput && userInput.startsWith('0x')) {
        const ok = await seaDrop.getFeeRecipientIsAllowed(nftContractAddr, userInput);
        if (ok) return userInput;
      }
      const payout = await seaDrop.getCreatorPayoutAddress(nftContractAddr);
      const ok2 = await seaDrop.getFeeRecipientIsAllowed(nftContractAddr, payout);
      if (ok2) return payout;
    } catch {}
    return '0x0000000000000000000000000000000000000000';
  };

  // ---- Scan wallets ----
  const scanWallets = async () => {
    if (!ethers) return addLog('❌ Ethers.js not loaded', 'error');
    if (!config.rpcUrl || !config.privateKeys) return addLog('❌ Fill RPC URL & Private Keys', 'error');

    const contractAddr = config.contractAddress || extractContractAddress(config.launchpadUrl);
    if (!contractAddr || !/^0x[a-fA-F0-9]{40}$/.test(contractAddr)) return addLog('❌ Invalid contract address', 'error');

    setIsScanning(true);
    addLog('🔍 Starting wallet scan...');

    const keys = parsePrivateKeys(config.privateKeys);
    if (!keys.length) { setIsScanning(false); return addLog('❌ No valid private keys', 'error'); }

    try {
      const provider = makeProvider(config.rpcUrl);
      addLog('🔗 Connected to RPC...');

      const chainInfo = await detectChainFromRPC(config.rpcUrl);
      setDetectedChain(chainInfo.name); setChainSymbol(chainInfo.symbol); setChainId(chainInfo.chainId);
      addLog(`🔗 Chain: ${chainInfo.name} (${chainInfo.symbol})`);

      let useSeaDrop = !!config.useSeaDrop;
      let price = '0';

      if (useSeaDrop) {
        if (!knownSeaDropChains.has(chainInfo.chainId) && config.seaDropAddress === '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5') {
          // likely unsupported chain for canonical address
          addLog('⚠️ This chain is not in the known SeaDrop deployments. Will verify...', 'warning');
        }
        const pf = await preflightSeaDrop(provider, config.seaDropAddress, contractAddr);
        setSeaDropUsable(pf.usable);
        setSeaDropRestrictsRecipients(!!pf.restrictFeeRecipients);

        if (!pf.usable) {
          addLog(`⚠️ SeaDrop unavailable: ${pf.reason}. Falling back to direct contract mint.`, 'warning');
          useSeaDrop = false;
        } else {
          price = pf.priceEth || '0';
          addLog('🎯 SeaDrop preflight OK — public drop is active.');
          addLog(`💰 Mint Price (SeaDrop): ${price} ${chainInfo.symbol}`);
        }
      }

      if (!useSeaDrop) {
        addLog('📄 Fetching contract ABI (direct mint)...');
        const abi = await getContractABI(contractAddr, chainInfo.chainId);
        setContractABI(abi);
        const mf = detectMintFunction(abi);
        setMintFunctionName(mf.name);
        setMintFunctionHasQuantity(mf.hasQuantity);
        addLog(`🎯 Detected mint function: ${mf.name}(${mf.hasQuantity ? 'uint256' : ''})`);
        price = await getMintPriceGeneric(provider, contractAddr, abi);
        addLog(`💰 Mint Price (contract): ${price} ${chainInfo.symbol}`);
      } else {
        setContractABI(seaDropAbi);
        setMintFunctionName('mintPublic');
        setMintFunctionHasQuantity(true);
        setSeaDropUsable(true);
      }

      setMintPrice(price);

      // Quick wallet scan
      const nft = new ethers.Contract(contractAddr, ["function balanceOf(address) view returns (uint256)"], provider);
      const scanned = [];
      for (const key of keys) {
        try {
          const wallet = new ethers.Wallet(key, provider);
          const balWei = await provider.getBalance(wallet.address);
          const bal = fmtEth(balWei);
          let hasMinted = false;
          try {
            const nb = await nft.balanceOf(wallet.address);
            hasMinted = Number(nb.toString()) > 0;
          } catch {}
          scanned.push({ address: wallet.address, privateKey: key, balance: bal, hasMinted, status: 'ready', gasEstimate: '0.002' });
        } catch (e) {
          addLog(`❌ Scan error: ${e.message}`, 'error');
        }
      }
      setScannedWallets(scanned);
      setWallets(scanned);
      setEstimatedGas(scanned[0]?.gasEstimate || '0.002');
      addLog(`✅ Scan complete! ${scanned.length} wallet(s) scanned`, 'success');
    } catch (e) {
      addLog(`❌ Scan failed: ${e.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // --- Helpers for better error messages ---
  const simulateCall = async (provider, tx) => {
    try {
      // v5/v6 normalize
      const callRes = await provider.call(tx);
      return { ok: true, data: callRes };
    } catch (e) {
      // try parse reason
      const msg = e?.shortMessage || e?.reason || e?.message || 'Reverted';
      return { ok: false, error: msg };
    }
  };

  const startMinting = async () => {
    if (!ethers) return addLog('❌ Ethers.js not loaded', 'error');
    if (!wallets.length) return addLog('❌ Please scan wallets first', 'error');

    const selectedPhases = Object.keys(mintPhases).filter(k => mintPhases[k]);
    if (!selectedPhases.length) return addLog('❌ Select at least one mint phase', 'error');

    const contractAddr = config.contractAddress || extractContractAddress(config.launchpadUrl);
    const provider = makeProvider(config.rpcUrl);

    let useSeaDrop = !!config.useSeaDrop && seaDropUsable;
    if (config.useSeaDrop && !seaDropUsable) addLog('⚠️ SeaDrop preflight failed earlier, using direct mint.', 'warning');

    let seaDropFeeRecipient = config.feeRecipient;

    if (useSeaDrop) {
      seaDropFeeRecipient = await resolveSeaDropFeeRecipient(provider, config.seaDropAddress, contractAddr, config.feeRecipient);
      if (seaDropRestrictsRecipients) {
        // Verify again to be safe
        const seaDrop = new ethers.Contract(config.seaDropAddress, seaDropAbi, provider);
        const allowed = await seaDrop.getFeeRecipientIsAllowed(contractAddr, seaDropFeeRecipient);
        if (!allowed) {
          addLog('❌ feeRecipient is not allowed by this drop (restrictFeeRecipients=true). Aborting SeaDrop path.', 'error');
          useSeaDrop = false;
        }
      }
    }

    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('🚀 Starting mint process...');
    addLog(`📋 Selected phases: ${selectedPhases.join(', ')}`);

    let successCount = 0, failedCount = 0;
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      w.status = 'minting'; setWallets([...wallets]);

      addLog(`🔄 Minting for wallet ${i + 1}/${wallets.length}: ${w.address.slice(0,6)}...${w.address.slice(-4)}`);

      if (w.hasMinted) {
        w.status = 'skipped'; w.error = 'Already minted';
        failedCount++; setWallets([...wallets]); setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        continue;
      }

      const q = BigInt(config.quantityPerWallet || 1);
      const value = toWei(((Number(mintPrice || '0')) * Number(q)).toString());

      // Prepare wallet + gas
      const signer = new ethers.Wallet(w.privateKey, provider);
      const baseGasPrice = await getGasPrice(provider);
      let gasPrice = baseGasPrice;
      if (config.gasLevel === 'high') gasPrice = (gasPrice * 120n) / 100n;
      else if (config.gasLevel === 'low') gasPrice = (gasPrice * 80n) / 100n;

      addLog(`⛽ Gas price: ${isV6 ? ethers.formatUnits(gasPrice, 'gwei') : ethers.utils.formatUnits(gasPrice.toString(), 'gwei')} Gwei`);

      let tries = 0, ok = false, txHash = null;
      while (!ok && tries <= (advancedOptions.autoRetry ? 3 : 0)) {
        if (tries > 0) addLog(`🔁 Retry ${tries}/3`, 'warning');
        tries++;

        try {
          let populated;
          if (useSeaDrop) {
            // --- Populate SeaDrop.mintPublic & simulate first ---
            const seaDrop = new ethers.Contract(config.seaDropAddress, seaDropAbi, signer);
            populated = await seaDrop.populateTransaction.mintPublic(
              contractAddr,
              seaDropFeeRecipient || '0x0000000000000000000000000000000000000000',
              signer.address,
              Number(q),
              { value }
            );
          } else {
            // --- Populate direct mint ---
            const abi = contractABI || genericAbi();
            const nft = new ethers.Contract(contractAddr, abi, signer);
            const fn = mintFunctionName || 'mint';
            const hasQty = mintFunctionHasQuantity;
            if (hasQty) {
              populated = await nft.populateTransaction[fn](Number(q), { value });
            } else {
              populated = await nft.populateTransaction[fn]({ value });
            }
          }

          // overrides
          populated.gasPrice = isV6 ? gasPrice : ethers.BigNumber.from(gasPrice.toString());
          if (!populated.gasLimit) {
            // light estimate
            try {
              const est = await provider.estimateGas({ ...populated, from: signer.address });
              populated.gasLimit = isV6 ? bnToBigInt(est) : est;
            } catch { populated.gasLimit = isV6 ? 300000n : 300000; }
          }

          // Simulate (for better revert reason)
          const sim = await simulateCall(provider, { to: populated.to, from: signer.address, data: populated.data, value: populated.value || 0 });
          if (!sim.ok) {
            addLog(`❌ Simulation revert: ${sim.error}`, 'error');
            throw new Error(sim.error);
          }

          // Send
          const tx = await signer.sendTransaction(populated);
          addLog(`⏳ Waiting for confirmation... TX: ${tx.hash}`);
          const rc = await tx.wait();
          if ((rc.status ?? 0) !== 1) throw new Error('Transaction failed');

          ok = true; txHash = tx.hash;
          addLog(`✅ Success! TX: ${txHash}`, 'success');
        } catch (e) {
          addLog(`❌ Mint attempt failed: ${e.message}`, 'error');
          if (tries > (advancedOptions.autoRetry ? 3 : 0)) break;
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (ok) {
        w.status = 'success'; w.txHash = txHash; successCount++;
        setMintStats(prev => ({ ...prev, success: prev.success + 1 }));
      } else {
        w.status = 'failed'; w.error = 'Failed after retries'; failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
      setWallets([...wallets]);

      if (i < wallets.length - 1) {
        addLog('⏳ Waiting 3 seconds before next wallet...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    setIsMinting(false);
    addLog('🎉 Minting process completed!', 'success');
    addLog(`📊 Results: ${successCount} success, ${failedCount} failed out of ${wallets.length}`);
  };

  const clearAll = () => {
    setConfig({
      launchpadUrl: '', contractAddress: '', rpcUrl: '', privateKeys: '',
      gasLevel: 'normal', useSeaDrop: true,
      seaDropAddress: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
      feeRecipient: '', quantityPerWallet: 1,
    });
    setWallets([]); setScannedWallets([]); setLogs([]);
    setMintStats({ success: 0, failed: 0, total: 0 });
    setMintPrice('0'); setEstimatedGas('0');
    setDetectedChain(''); setChainSymbol('ETH'); setChainId(1);
    setContractABI(null); setMintFunctionName(''); setMintFunctionHasQuantity(false);
    setSeaDropUsable(false); setSeaDropRestrictsRecipients(false);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'minting': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (w) =>
    w.status === 'ready' ? 'Ready' :
    w.status === 'minting' ? 'Minting...' :
    w.status === 'success' ? (w.txHash ? `Success: ${w.txHash.slice(0,10)}...` : 'Success') :
    w.status === 'failed' ? (w.error || 'Failed') :
    w.status === 'skipped' ? (w.error || 'Skipped') : 'Unknown';

  const getExplorerUrl = (cid, txHash) => {
    const explorers = {
      1: 'https://etherscan.io',
      137: 'https://polygonscan.com',
      42161: 'https://arbiscan.io',
      10: 'https://optimistic.etherscan.io',
      8453: 'https://basescan.org',
      11155111: 'https://sepolia.etherscan.io',
      5: 'https://goerli.etherscan.io',
    };
    return `${explorers[cid] || 'https://etherscan.io'}/tx/${txHash}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-300" />
            <div>
              <h1 className="text-3xl font-bold text-white">OpenSea Launchpad Mint Bot (SeaDrop)</h1>
              <p className="text-purple-100 text-sm">Robust preflight + auto-fallback for unsupported chains</p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 mt-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong>Security:</strong> Private keys hanya di memori. Verifikasi alamat kontrak & mulai kecil. Transaksi irreversibel.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📝</span> Configuration
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">OpenSea Link / NFT Contract Address</label>
                  <input
                    type="text"
                    value={config.launchpadUrl}
                    onChange={(e) => setConfig({ ...config, launchpadUrl: e.target.value, contractAddress: extractContractAddress(e.target.value) })}
                    placeholder="https://opensea.io/... or 0x..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {config.contractAddress && (
                    <p className="text-xs text-green-400 mt-1">Detected contract: {config.contractAddress}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      RPC URL {detectedChain && <span className="text-purple-400">({detectedChain})</span>}
                    </label>
                    <input
                      type="text"
                      value={config.rpcUrl}
                      onChange={(e) => setConfig({ ...config, rpcUrl: e.target.value })}
                      placeholder="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Private Keys (one per line)</label>
                    <textarea
                      value={config.privateKeys}
                      onChange={(e) => setConfig({ ...config, privateKeys: e.target.value })}
                      rows={4}
                      placeholder="0xabc...\n0xdef..."
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">{parsePrivateKeys(config.privateKeys).length}/10 valid wallets</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.useSeaDrop}
                      onChange={(e) => setConfig({ ...config, useSeaDrop: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600"
                    />
                    <span className="text-white text-sm">Use OpenSea Launchpad (SeaDrop)</span>
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Quantity per wallet</label>
                    <input
                      type="number" min={1}
                      value={config.quantityPerWallet}
                      onChange={(e) => setConfig({ ...config, quantityPerWallet: Math.max(1, Number(e.target.value||1)) })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                    />
                  </div>
                </div>

                {config.useSeaDrop && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">SeaDrop Address</label>
                      <input
                        type="text"
                        value={config.seaDropAddress}
                        onChange={(e) => setConfig({ ...config, seaDropAddress: e.target.value })}
                        placeholder="0x00005EA0..."
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                      />
                      <p className="text-xs text-gray-400 mt-1">Default: canonical SeaDrop on major chains</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Fee Recipient (optional)</label>
                      <input
                        type="text"
                        value={config.feeRecipient}
                        onChange={(e) => setConfig({ ...config, feeRecipient: e.target.value })}
                        placeholder="auto-detect if empty"
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Gas Level</label>
                      <select
                        value={config.gasLevel}
                        onChange={(e) => setConfig({ ...config, gasLevel: e.target.value })}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                      >
                        <option value="low">Low (-20%)</option>
                        <option value="normal">Normal</option>
                        <option value="high">High (+20%)</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    onClick={scanWallets}
                    disabled={isScanning || isMinting}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2"
                  >
                    {isScanning ? (<><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>) : (<><Scan className="w-4 h-4" />Scan Eligible</>)}
                  </button>
                </div>
              </div>

              {scannedWallets.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <label className="block text-sm font-medium text-gray-300 mb-3">Mint Phase Selection</label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={mintPhases.public} onChange={(e)=> setMintPhases({...mintPhases, public: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600" />
                      <span className="text-white">Public Mint</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={mintPhases.whitelist} onChange={(e)=> setMintPhases({...mintPhases, whitelist: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600" />
                      <span className="text-white">Whitelist (SeaDrop need proof)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={mintPhases.allowlist} onChange={(e)=> setMintPhases({...mintPhases, allowlist: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600" />
                      <span className="text-white">Allowlist (SeaDrop need proof)</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={startMinting}
                  disabled={isMinting || wallets.length === 0}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  {isMinting ? (<><Loader2 className="w-5 h-5 animate-spin" />Minting...</>) : (<><Zap className="w-5 h-5" />Start Mint</>)}
                </button>

                <button
                  onClick={clearAll}
                  disabled={isMinting || isScanning}
                  className="px-6 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 text-white py-3 rounded-lg font-semibold"
                >
                  Clear
                </button>
              </div>
            </div>

            {wallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">📊</span> Wallet Status ({wallets.length} wallets)
                </h2>
                <div className="space-y-2">
                  {wallets.map((w, idx) => (
                    <div key={idx} className="bg-slate-700/30 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(w.status)}
                        <div className="flex-1">
                          <p className="text-white font-mono text-sm">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                          <p className="text-gray-400 text-xs">Balance: {w.balance} {chainSymbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          w.status === 'success' ? 'text-green-400' :
                          w.status === 'failed' ? 'text-red-400' :
                          w.status === 'minting' ? 'text-blue-400' :
                          w.status === 'skipped' ? 'text-yellow-400' : 'text-gray-400'
                        }`}>
                          {getStatusText(w)}
                        </p>
                        {w.txHash && (
                          <a href={getExplorerUrl(chainId, w.txHash)} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300">View TX →</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {mintStats.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4">
                    <div className="text-center"><p className="text-2xl font-bold text-green-400">{mintStats.success}</p><p className="text-xs text-gray-400">Success</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-red-400">{mintStats.failed}</p><p className="text-xs text-gray-400">Failed</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-purple-400">{mintStats.total}</p><p className="text-xs text-gray-400">Total</p></div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {scannedWallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">💰</span> Mint Info
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-400">Mint Price:</span><span className="text-white font-semibold">{mintPrice} {chainSymbol}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Est. Gas:</span><span className="text-white font-semibold">{estimatedGas} {chainSymbol}</span></div>
                  <div className="flex justify-between pt-2 border-t border-slate-700">
                    <span className="text-gray-400">Total (est) / wallet:</span>
                    <span className="text-purple-400 font-bold">{(parseFloat(mintPrice||'0') + parseFloat(estimatedGas||'0')).toFixed(6)} {chainSymbol}</span>
                  </div>
                  {detectedChain && (<div className="flex justify-between"><span className="text-gray-400">Chain:</span><span className="text-white font-semibold">{detectedChain}</span></div>)}
                  {mintFunctionName && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Mint Function:</span>
                      <span className="text-white font-mono text-sm">
                        {config.useSeaDrop && seaDropUsable ? `SeaDrop.${mintFunctionName}(address,address,address,uint256)` : `${mintFunctionName}(${mintFunctionHasQuantity ? 'uint256' : ''})`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2"><span className="text-2xl">📜</span> Live Logs</h2>
              <div className="bg-slate-900/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No logs yet. Start by scanning wallets.</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-gray-500 flex-shrink-0">[{log.timestamp}]</span>
                        <span className={
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'success' ? 'text-green-400' :
                          log.type === 'warning' ? 'text-yellow-400' : 'text-gray-300'
                        }>{log.message}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-gray-400 text-sm pb-4">
          <p>⚠️ Real minting tool. Use at your own risk.</p>
          <p className="mt-1">SeaDrop allowlist/signed mints need proofs/signatures from project.</p>
        </div>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
