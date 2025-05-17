// wallet.js – Phantom 지갑 감지, 네트워크 전환, Ethers v5 문법 일관성

// 전역 변수 (main.js와 공유될 수 있음)
// provider, signer, walletAddress, isConnected, isAdmin 등은 main.js 또는 여기서 선언하고 관리합니다.
// 이 코드에서는 이 파일 내에서 주로 관리하고, main.js는 이를 참조한다고 가정합니다.
// 하지만 main.js에서 선언하고 여기서 할당하는 패턴도 가능합니다.
// 여기서는 wallet.js에서 선언된 것으로 간주하고 진행합니다. (main.js의 선언은 주석 처리 또는 제거 필요)

// let provider; // main.js에서 선언했다면 이 줄은 주석 처리
// let signer;   // main.js에서 선언했다면 이 줄은 주석 처리
// let walletAddress = ""; // main.js에서 선언했다면 이 줄은 주석 처리
// let isConnected = false; // main.js에서 선언했다면 이 줄은 주석 처리
// let isAdmin = false; // main.js에서 선언했다면 이 줄은 주석 처리 (main.js에서 제거했었음)

let expectedChainId = null; // deploy.json에서 읽어온 숫자 형태의 체인 ID
let adminChecked = false;

let adminToolComponents = {}; // DApp 내 관리자 UI용 (p5.Element 저장)
let adminToolButtons = [];    // DApp 내 관리자 버튼용 (p5.Element 저장)

let tMONGDecimals = null;
let tMONGSymbol = null;

const TMONG_MINIMAL_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

async function loadDeployInfo() {
    if (expectedChainId !== null && typeof window.__SLOT_ADDR__ !== 'undefined' && typeof window.__TMONG_ADDR__ !== 'undefined') {
        return true;
    }
    // showLoading은 connectWallet에서 이미 호출됨
    try {
        const response = await fetch("./deploy.json"); // admin.html과 같은 위치 또는 DApp 루트 기준
        if (!response.ok) throw new Error("Failed to fetch deploy.json. Status: " + response.status);
        const info = await response.json();
        if (!info.chainId || !info.SlotMachine || !info.tMONG) throw new Error("deploy.json is missing key data (chainId, SlotMachine, tMONG).");
        expectedChainId = Number(info.chainId);
        window.__SLOT_ADDR__ = info.SlotMachine;
        window.__TMONG_ADDR__ = info.tMONG;
        console.log("[DeployInfo] Loaded successfully. Expected Chain ID:", expectedChainId);
        return true;
    } catch (e) {
        console.error("❌ deploy.json load failed:", e);
        expectedChainId = null;
        window.__SLOT_ADDR__ = undefined;
        window.__TMONG_ADDR__ = undefined;
        return false; // 호출부에서 오류 처리 및 hideLoading
    }
}

// 네트워크 전환 요청 함수
async function switchToCorrectNetwork() {
    const detectedWalletProvider = detectEthereumProvider(); // 현재 활성화된 프로바이더 사용
    if (!detectedWalletProvider) throw new Error("No Ethereum compatible wallet (like MetaMask or Phantom) is installed.");

    if (expectedChainId === null) {
        await loadDeployInfo();
        if (expectedChainId === null) throw new Error("Expected Chain ID not configured. Cannot switch network.");
    }

    const targetChainIdHex = '0x' + expectedChainId.toString(16);

    try {
        await detectedWalletProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetChainIdHex }],
        });
        console.log(`Successfully switched to chain ID: ${targetChainIdHex}`);
        // 네트워크 전환 성공 후, provider, signer, walletAddress를 갱신해야 함.
        // Ethers v5
        provider = new ethers.providers.Web3Provider(detectedWalletProvider, "any");
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
        // isConnected는 호출부에서 관리하거나 여기서 true로 설정
        return true;
    } catch (switchError) {
        if (switchError.code === 4902) { // Chain not added
            console.log(`Chain ID ${targetChainIdHex} not found in wallet. User may need to add it manually.`);
            alert(`Network (Chain ID: ${expectedChainId}) is not added to your wallet. Please add it manually if your wallet supports it, or check wallet settings.`);
            // 선택적: wallet_addEthereumChain 로직 (네트워크 정보 필요)
            // const networkDetails = { chainId: targetChainIdHex, chainName: 'Monad Testnet', rpcUrls: ['YOUR_RPC_URL'], nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, blockExplorerUrls: ['YOUR_EXPLORER_URL'] };
            // try {
            //     await detectedWalletProvider.request({ method: 'wallet_addEthereumChain', params: [networkDetails] });
            //     await detectedWalletProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainIdHex }] }); // 다시 전환 시도
            //     provider = new ethers.providers.Web3Provider(detectedWalletProvider, "any");
            //     signer = provider.getSigner();
            //     walletAddress = await signer.getAddress();
            //     return true;
            // } catch (addError) {
            //     console.error("Failed to add or switch to the new chain:", addError);
            //     alert(`Failed to add network ${expectedChainId}. Please add it manually.`);
            //     return false;
            // }
        } else {
            console.error("Failed to switch network:", switchError);
            alert(`Failed to switch network. Please switch to Chain ID ${expectedChainId} in your wallet manually. Error: ${switchError.message || switchError}`);
        }
        return false;
    }
}

// 현재 네트워크 확인 및 필요한 경우 전환 요청 함수
async function ensureCorrectNetwork() {
    if (!provider) { // provider는 connectWallet에서 설정됨
        console.warn("Provider not available to check network. Connect wallet first.");
        // connectWallet을 먼저 호출하도록 유도하거나, 여기서 false 반환 후 UI에서 연결 유도
        alert("Wallet not connected. Please connect your wallet first.");
        return false;
    }
    if (expectedChainId === null) {
        if (!await loadDeployInfo() || expectedChainId === null) { // deploy.json 로드 재시도
            alert("DApp configuration error: Expected network ID is not set.");
            return false;
        }
    }

    const currentNetwork = await provider.getNetwork();
    if (currentNetwork.chainId !== expectedChainId) {
        if (typeof showLoading === 'function') showLoading(`Incorrect network. Requesting switch to Chain ID ${expectedChainId}...`);
        const switched = await switchToCorrectNetwork(); // 여기서 provider, signer 갱신 시도
        if (typeof hideLoading === 'function') hideLoading();
        
        if (!switched) {
            alert(`Please switch to the correct network (Chain ID: ${expectedChainId}) to proceed.`);
            return false;
        }
        // switchToCorrectNetwork 성공 시 provider, signer가 갱신되었으므로, isConnected 등 상태도 업데이트 필요
        // 가장 간단한 방법은 페이지 새로고침 또는 connectWallet 재실행 유도
        console.log("Network switched. It's recommended to re-verify or re-initiate connection if DApp state is inconsistent.");
        // window.location.reload(); // 또는
        // await connectWallet(); // 재귀 호출은 매우 주의해서 사용해야 함. 상태 꼬임 방지.
        return true; // 일단 스위치 성공으로 간주
    }
    return true; // 이미 올바른 네트워크
}


async function cacheTMONGMetadata() {
    if (!provider || !window.__TMONG_ADDR__) {
        console.warn("[TMONGMetadata] Provider or tMONG address not available for caching.");
        return false;
    }
    if (tMONGDecimals !== null && tMONGSymbol !== null) {
        console.log("[TMONGMetadata] Already cached.");
        return true;
    }
    try {
        console.log("[TMONGMetadata] Fetching and caching decimals and symbol...");
        const tmongContract = new ethers.Contract(window.__TMONG_ADDR__, TMONG_MINIMAL_ABI, provider);
        const [decimalsResult, symbolResult] = await Promise.all([
            tmongContract.decimals(),
            tmongContract.symbol()
        ]);
        tMONGDecimals = Number(decimalsResult);
        tMONGSymbol = symbolResult;
        console.log(`[TMONGMetadata] Cached: Decimals=${tMONGDecimals}, Symbol=${tMONGSymbol}`);
        return true;
    } catch (error) {
        console.error("Error caching tMONG metadata:", error);
        tMONGDecimals = null; tMONGSymbol = null;
        return false;
    }
}

async function getTMongBalance(userAddress) {
    if (!provider || !window.__TMONG_ADDR__ || !userAddress || !ethers.utils.isAddress(userAddress)) {
        console.warn("[Balance] Prerequisites not met for balance fetch.");
        return "N/A";
    }
    if (tMONGDecimals === null || tMONGSymbol === null) {
        await cacheTMONGMetadata();
    }
    const currentDecimals = tMONGDecimals !== null ? tMONGDecimals : 18;
    const currentSymbol = tMONGSymbol !== null ? tMONGSymbol : "$tMONG";

    try {
        const tmongContract = new ethers.Contract(window.__TMONG_ADDR__, TMONG_MINIMAL_ABI, provider);
        const balanceBigNumber = await tmongContract.balanceOf(userAddress);
        
        let finalDecimals = currentDecimals;
        let finalSymbol = currentSymbol;
        if (tMONGDecimals === null && typeof tmongContract.decimals === 'function') {
            try { finalDecimals = Number(await tmongContract.decimals()); tMONGDecimals = finalDecimals; }
            catch(e) { console.warn("Failed to fetch decimals on fallback."); }
        }
        if (tMONGSymbol === null && typeof tmongContract.symbol === 'function') {
            try { finalSymbol = await tmongContract.symbol(); tMONGSymbol = finalSymbol; }
            catch(e) { console.warn("Failed to fetch symbol on fallback."); }
        }
        const formattedBalance = ethers.utils.formatUnits(balanceBigNumber, finalDecimals);
        return `${formattedBalance} ${finalSymbol}`;
    } catch (error) {
        console.error("Error fetching tMONG balance:", error);
        if (error.code === -32603 || error.message?.includes("429")) {
            return "Balance update delayed (RPC limit).";
        }
        return "Error fetching balance";
    }
}

async function addTMongToMetamask() {
    const detectedWalletProvider = detectEthereumProvider();
    if (!detectedWalletProvider) return alert("No Ethereum compatible wallet detected.");
    if (!window.__TMONG_ADDR__) return alert("tMONG token contract address unknown. Please check deploy.json.");

    showLoading("Adding $tMONG to your wallet...");
    let tokenSymbol = tMONGSymbol || '$tMONG';
    let tokenDecimals = tMONGDecimals !== null ? tMONGDecimals : 18;

    try {
        // provider는 전역 변수이므로, 이미 connectWallet에서 설정되었다고 가정
        if (provider && (tMONGSymbol === null || tMONGDecimals === null)) {
            const tmongContractForInfo = new ethers.Contract(window.__TMONG_ADDR__, TMONG_MINIMAL_ABI, provider);
            if (tMONGSymbol === null) tokenSymbol = await tmongContractForInfo.symbol();
            if (tMONGDecimals === null) tokenDecimals = Number(await tmongContractForInfo.decimals());
            if (tMONGSymbol === null && tokenSymbol) tMONGSymbol = tokenSymbol;
            if (tMONGDecimals === null && tokenDecimals) tMONGDecimals = tokenDecimals;
        } else if (!provider) {
            console.warn("addTMongToMetamask: Wallet provider not available for metadata fetch.");
        }

        await detectedWalletProvider.request({
            method: 'wallet_watchAsset',
            params: { type: 'ERC20', options: { address: window.__TMONG_ADDR__, symbol: tokenSymbol, decimals: tokenDecimals }},
        });
        alert(`${tokenSymbol} token added (or attempt was made). Please check your wallet.`);
    } catch (e) {
        alert(`Error adding ${tokenSymbol} token: ${e.message}`); console.error(e);
    } finally { hideLoading(); }
}
window.addTMongToMetamask = addTMongToMetamask;

async function getSlotMachineContractBalance() {
    if (!provider || !window.__SLOT_ADDR__) return null;
    try {
        return ethers.utils.formatEther(await provider.getBalance(window.__SLOT_ADDR__));
    } catch (e) { console.error("Error fetching contract balance:", e); return null; }
}

async function getCurrentMetamaskAddress() {
    const detectedWalletProvider = detectEthereumProvider();
    if (!detectedWalletProvider) return null;
    try {
        const accounts = await detectedWalletProvider.request({ method: 'eth_accounts' });
        return accounts?.[0] ? ethers.utils.getAddress(accounts[0]) : null;
    } catch (e) { console.error("Error getCurrentMetamaskAddress:", e); return null; }
}

function disconnectAndReset(reason = "Session ended. Please log in again.") {
    console.log(`[Disconnect] Reason: ${reason}`);
    
    const oldWalletForStorage = playerSession?.wallet;

    walletAddress = ""; provider = null; signer = null;
    isConnected = false; isAdmin = false; adminChecked = false;
    if (connectButton) connectButton.html("🦊 Connect Wallet");
    if (walletDisplay) walletDisplay.html("");

    Object.values(adminToolComponents).forEach(comp => { if (comp?.remove) comp.remove(); });
    adminToolComponents = {};
    adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
    adminToolButtons = [];

    if (playerSession?.wallet) localStorage.removeItem(`slot_session_${playerSession.wallet}`);
    playerSession = { wallet: "", seeds: [], paidSeeds: [], totalScore: 0 };

    gameStarted = false; score = 0; playCredits = 0; result = ''; spinning = false;
    if (typeof reels !== 'undefined') reels.length = 0;
    if (typeof scoreBreakdown !== 'undefined') scoreBreakdown.length = 0;

    if (typeof hideTokenInfoUI === 'function') hideTokenInfoUI();

    const activeProvider = detectEthereumProvider();
    if (activeProvider && activeProvider.removeListener) {
        activeProvider.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
        activeProvider.removeListener('chainChanged', handleMetaMaskChainChanged);
    }
    
    if (typeof globalIsLoading !== 'undefined' && globalIsLoading && typeof hideLoading === 'function') {
        hideLoading();
    }
    if (typeof restoreDefaultLayout === 'function') {
        restoreDefaultLayout(); 
    }
    
    setTimeout(() => { if (reason) alert(reason); }, 50);
    console.log("-------------------[DISCONNECT END]------------------");
}

function handleMetaMaskChainChanged(chainId) { // 체인 변경 시 호출될 함수
  const newChainId = Number(chainId); // 16진수 문자열 chainId를 숫자로 변환
  console.log(`[WalletJS] MetaMask network changed to Chain ID: ${newChainId}. Verifying...`);

  // main.js 에 정의된 showLoading, hideLoading, globalIsLoading 전역 변수를 사용한다고 가정
  // 만약 main.js 와의 의존성을 줄이려면, 이 함수 내에서 alert만 사용하거나,
  // wallet.js 자체적으로 간단한 로딩 표시 로직을 가져야 함.
  // 여기서는 main.js의 함수를 사용한다고 가정.
  if (typeof showLoading === 'function') {
      if (typeof globalIsLoading === 'undefined' || !globalIsLoading) {
          showLoading("Network change detected. Verifying...");
      } else {
          showLoading("Network change detected. Verifying..."); // 이미 로딩 중이면 메시지 업데이트
      }
  }

  if (expectedChainId === null) { // deploy.json이 아직 로드되지 않았을 수 있음
      console.warn("[WalletJS-ChainChange] expectedChainId is null. Cannot verify network yet.");
      // 이 경우, 사용자가 다시 연결 시도 시 loadDeployInfo가 실행될 것임.
      if (typeof hideLoading === 'function') hideLoading();
      return;
  }

  if (newChainId !== expectedChainId) {
      console.warn(`[WalletJS-ChainChange] Incorrect network. Expected: ${expectedChainId}, Got: ${newChainId}`);
      // isConnected는 main.js 또는 wallet.js의 전역 상태
      // disconnectAndReset은 이 파일(wallet.js)에 정의된 함수
      disconnectAndReset(`Network changed. Please connect to the correct network (Chain ID: ${expectedChainId}). Wallet disconnected.`);
  } else if (isConnected) { // isConnected는 main.js 또는 wallet.js의 전역 상태
      console.log("[WalletJS-ChainChange] Network is correct. Current session maintained.");
      // 이미 올바른 네트워크로 변경되었고, 연결된 상태라면 추가 조치가 필요 없을 수 있음.
      // 단, provider 객체 등은 새 네트워크에 맞게 갱신되었는지 확인 필요 (connectWallet에서 처리)
      if (typeof hideLoading === 'function') hideLoading();
  } else {
      // 연결되지 않은 상태에서 올바른 네트워크로 변경된 경우
      console.log("[WalletJS-ChainChange] Network is correct, but wallet not connected. User can now connect.");
      if (typeof hideLoading === 'function') hideLoading();
  }
}

async function checkMetamaskAccountConsistency() {
    if (!isConnected || !playerSession?.wallet) return true;
    const currentMetaMaskAddr = await getCurrentMetamaskAddress();
    if (currentMetaMaskAddr && playerSession.wallet && currentMetaMaskAddr.toLowerCase() !== ethers.utils.getAddress(playerSession.wallet).toLowerCase()) {
        disconnectAndReset("MetaMask active account differs from the DApp's logged-in account. Logged out for security.");
        return false;
    }
    return true;
}
window.checkMetamaskAccountConsistency = checkMetamaskAccountConsistency;

async function handleMetaMaskAccountsChanged(accounts) {
    console.log("---[DApp ACCOUNTS CHANGED START]---");
    if (typeof showLoading === 'function' && (typeof globalIsLoading === 'undefined' || !globalIsLoading)) {
        showLoading("Account change detected. Verifying session...");
    } else if (typeof showLoading === 'function') {
        showLoading("Account change detected. Verifying session...");
    }

    const newActiveAddr = accounts?.[0] ? ethers.utils.getAddress(accounts[0]) : null;
    const loggedInWallet = walletAddress;
    const loggedInAddr = loggedInWallet ? ethers.utils.getAddress(loggedInWallet) : null;

    console.log(`[DApp Accounts Changed] Current DApp session address: ${loggedInAddr}, New MetaMask active address: ${newActiveAddr}`);

    if (!isConnected || !loggedInAddr) { 
        if (typeof hideLoading === 'function') hideLoading();
        console.log("[DApp Accounts Changed] DApp not connected or no initial session.");
        return; 
    }

    if (!newActiveAddr) {
        console.log("[DApp Accounts Changed] MetaMask accounts disconnected or locked.");
        disconnectAndReset("MetaMask account connection lost or locked.");
    } else if (newActiveAddr.toLowerCase() !== loggedInAddr.toLowerCase()) {
        console.log("[DApp Accounts Changed] MetaMask active account differs. Resetting session.");
        disconnectAndReset(`Account changed. Logged out. Please reconnect with ${newActiveAddr.slice(0, 6)}...`);
    } else {
        console.log("[DApp Accounts Changed] Account same. Session maintained.");
        if (typeof hideLoading === 'function') hideLoading();
    }
    console.log("---[DApp ACCOUNTS CHANGED END]---");
}

function detectEthereumProvider() {
    let providerToUse = null;
    // EIP-6963: Check for multiple injected providers
    if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
        // Prioritize Phantom if available and identifiable (e.g., by a specific flag or name)
        providerToUse = window.ethereum.providers.find(p => p.isPhantom); // Phantom specific flag
        if (providerToUse) {
            console.log("Phantom provider found in window.ethereum.providers (EIP-6963).");
            return providerToUse;
        }
        // Fallback to MetaMask or the first available one if Phantom not found
        providerToUse = window.ethereum.providers.find(p => p.isMetaMask);
        if (providerToUse) {
            console.log("MetaMask provider found in window.ethereum.providers (EIP-6963).");
            return providerToUse;
        }
        if(window.ethereum.providers.length > 0){
            console.log("Using the first provider from window.ethereum.providers (EIP-6963).");
            return window.ethereum.providers[0];
        }
    }

    // Standard EIP-1193 check (single provider, or browser default)
    if (window.ethereum) {
        if (window.ethereum.isPhantom) {
            console.log("Phantom provider detected (window.ethereum.isPhantom).");
            return window.ethereum;
        }
        if (window.ethereum.isMetaMask) {
            console.log("MetaMask provider detected (window.ethereum.isMetaMask).");
            return window.ethereum;
        }
        // Could be other EIP-1193 wallets or MetaMask/Phantom without the specific flag
        console.log("Generic EIP-1193 provider (window.ethereum) detected.");
        return window.ethereum;
    }
    
    // Fallback for Phantom if it injects itself at window.phantom.ethereum
    if (window.phantom?.ethereum) {
        console.log("Dedicated Phantom Ethereum provider (window.phantom.ethereum) detected.");
        return window.phantom.ethereum;
    }
    
    console.log("No Ethereum provider (MetaMask, Phantom, etc.) detected.");
    return null;
}


async function connectWallet() {
    console.log("---[CONNECT WALLET START]---");
    showLoading("Connecting wallet...");

    try {
        if (!await loadDeployInfo()){
            hideLoading(); 
            throw new Error("Failed to load DApp configuration. Please refresh.");
        }
        if (isConnected) { disconnectAndReset("User disconnected."); return; }

        showLoading("Detecting and connecting to wallet...");
        const detectedWalletProvider = detectEthereumProvider();
        if (!detectedWalletProvider) { 
            throw new Error("🦊 No Ethereum wallet (like MetaMask or Phantom) detected. Please install one and refresh."); 
        }
        
        provider = new ethers.providers.Web3Provider(detectedWalletProvider, "any"); // Ethers v5
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();

        showLoading("Verifying network...");
        const net = await provider.getNetwork();
        if (net.chainId !== expectedChainId) {
            const switched = await switchToCorrectNetwork(); 
            if (!switched) {
                throw new Error(`Please switch to the correct network (Chain ID: ${expectedChainId}) to continue.`);
            }
            // switchToCorrectNetwork should have updated provider, signer, walletAddress
            // Re-check network after switch attempt, though switchToCorrectNetwork should ensure it.
            const newNet = await provider.getNetwork();
            if (newNet.chainId !== expectedChainId) {
                 throw new Error(`Network switch failed or was not completed. Still on Chain ID ${newNet.chainId}.`);
            }
        }
        
        showLoading("Requesting signature...");
        await signer.signMessage("Sign to use Monad SlotMachine and verify ownership.");

        isConnected = true;
        if (walletDisplay) walletDisplay.html(`${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`);
        if (connectButton) connectButton.html("🔓 Disconnect");

        if (detectedWalletProvider.removeListener) { 
            detectedWalletProvider.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
            detectedWalletProvider.removeListener('chainChanged', handleMetaMaskChainChanged);
        }
        if (detectedWalletProvider.on) { 
            detectedWalletProvider.on('accountsChanged', handleMetaMaskAccountsChanged);
            detectedWalletProvider.on('chainChanged', handleMetaMaskChainChanged);
        }

        showLoading("Synchronizing player data...");
        adminChecked = false; 
        await cacheTMONGMetadata();

        const slotContractInstance = (typeof getSlot === 'function') ? await getSlot() : null;
        const results = await Promise.allSettled([
            getTMongBalance(walletAddress),
            slotContractInstance?.getUnclaimedUserSeeds(walletAddress),
            (async () => {
                if (window.__SLOT_ADDR__ && provider && slotContractInstance) {
                    try {
                        const owner = await slotContractInstance.owner();
                        adminChecked = true;
                        return (owner.toLowerCase() === walletAddress.toLowerCase());
                    } catch (e) { console.warn("Admin check (owner) failed:", e); adminChecked = true; return false; }
                }
                adminChecked = true; return false;
            })()
        ]);

        const tmongBalanceStr = results[0].status === 'fulfilled' ? results[0].value : "N/A";
        const unclaimedData = results[1].status === 'fulfilled' ? results[1].value : null;
        isAdmin = results[2].status === 'fulfilled' ? results[2].value : false;

        if (typeof updateTokenInfoUI === 'function') updateTokenInfoUI(tmongBalanceStr, window.__TMONG_ADDR__);

        let contractUnclaimedSeedValues = [];
        if (unclaimedData && ethers.utils.getAddress(unclaimedData[0]).toLowerCase() === walletAddress.toLowerCase()) {
            contractUnclaimedSeedValues = unclaimedData[1].map(s => s.toString());
        }

        const loadedLocalSession = loadSession(walletAddress);
        let newPlayerSession = { wallet: walletAddress, totalScore: loadedLocalSession.totalScore || 0, seeds: [], paidSeeds: [] };
        const allSeedsMap = new Map();
        [...(loadedLocalSession.seeds || []), ...(loadedLocalSession.paidSeeds || [])].forEach(s => allSeedsMap.set(s.value, { ...s }));
        contractUnclaimedSeedValues.forEach(v => { if (!allSeedsMap.has(v)) allSeedsMap.set(v, { value: v, used: false, score: 0, originalType: 'free' }); });
        
        allSeedsMap.forEach(s => {
            if (s.originalType === 'paid') newPlayerSession.paidSeeds.push(s); else newPlayerSession.seeds.push(s);
        });
        newPlayerSession.seeds = Array.from(new Map(newPlayerSession.seeds.map(s => [s.value, s])).values());
        newPlayerSession.paidSeeds = Array.from(new Map(newPlayerSession.paidSeeds.map(s => [s.value, s])).values());
        playerSession = newPlayerSession;

        if (typeof saveSession === 'function') saveSession();

        score = playerSession.totalScore || 0;
        if (typeof hasRemainingSeeds === 'function' && hasRemainingSeeds()) {
            playCredits = (playerSession.seeds?.filter(s => !s.used).length || 0) + (playerSession.paidSeeds?.filter(s => !s.used).length || 0);
            gameStarted = true;
            if (typeof reels !== 'undefined' && reels.length === 0 && typeof createReel === 'function') {
                 for (let i = 0; i < 3; i++) reels.push(createReel());
            }
        } else {
            playCredits = 0; gameStarted = false;
        }

        if (isAdmin && typeof setupDevTools === 'function') {
            if(typeof hideLoading === 'function') hideLoading(); 
            await setupDevTools(); 
        } else {
            if (typeof hideLoading === 'function') {
                hideLoading();
            }
        }
        
        console.log(`[ConnectWallet] Done. Credits: ${playCredits}, Admin: ${isAdmin}, Game Started: ${gameStarted}`);
        console.log("---[CONNECT WALLET END]---");

    } catch (e) {
        alert("❌ Wallet Connection Error: " + (e.message || "Unknown error. Check console."));
        console.error("Wallet connection error:", e);
        isConnected = false; 
        if (connectButton) connectButton.html("🦊 Connect Wallet");
        if (walletDisplay) walletDisplay.html("");
        Object.values(adminToolComponents).forEach(comp => { if (comp?.remove) comp.remove(); }); adminToolComponents = {};
        adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); }); adminToolButtons = [];
        if (typeof hideTokenInfoUI === 'function') hideTokenInfoUI();
        
        const activeProviderOnError = detectEthereumProvider();
        if (activeProviderOnError && activeProviderOnError.removeListener) {
            activeProviderOnError.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
            activeProviderOnError.removeListener('chainChanged', handleMetaMaskChainChanged);
        }
        if(typeof hideLoading === 'function') hideLoading();
        console.log("---[CONNECT WALLET ERROR END]---");
    }
}

// setupDevTools 함수는 이전 답변의 코드를 유지 (DApp 내 관리자 UI는 기본 3개 버튼만 표시)
async function setupDevTools() {
    if (!isAdmin) {
        adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
        adminToolButtons = [];
        return;
    }
    showLoading("Setting up Admin Tools...");
    
    adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
    adminToolButtons = [];
    // adminToolComponents는 DApp 내에서는 사용하지 않으므로 관련 로직 제거 또는 최소화
    
    let currentX = 20; 
    let walletDisplayWidth = 0; 
    if (walletDisplay && walletDisplay.elt) {
        try { 
            walletDisplayWidth = walletDisplay.elt.offsetWidth > 0 ? walletDisplay.elt.offsetWidth : 100; 
        } catch(e){
            console.warn("Could not get walletDisplay offsetWidth, using default for admin button positioning.");
            walletDisplayWidth = 100; 
        }
    } else {
        walletDisplayWidth = 100; 
    }

    if (connectButton && connectButton.elt) {
        currentX = connectButton.x + connectButton.width;
        if (walletDisplay && walletDisplay.elt) {
             currentX += walletDisplayWidth + 10; 
        } else {
            currentX += 10; 
        }
    }
    
    currentX -= 150; 

    let currentY = connectButton ? connectButton.y : 20; 
    const buttonHeight = 25;
    const spacing = 8;
    
    let contractBalanceEth = null;
    try { contractBalanceEth = await getSlotMachineContractBalance(); } catch(e) { console.error(e); }
    let withdrawAllLabel = `💸 Withdraw All ${contractBalanceEth ? `(${parseFloat(contractBalanceEth).toFixed(2)} MON)` : ''}`;
    
    const adminActions = [
        { label: "🧹 Clear Session", width: 140, action: () => { if (globalIsLoading) return; showLoading("Clearing session..."); localStorage.removeItem(`slot_session_${walletAddress}`); alert("Session cleared. Reloading..."); location.reload(); }},
        { label: withdrawAllLabel, width: 180, action: async () => { if (globalIsLoading) return; if(!signer) return alert("No signer"); showLoading("Withdrawing all..."); try {const c=new ethers.Contract(window.__SLOT_ADDR__,["function withdrawAll()"],signer); const tx=await c.withdrawAll();showLoading(`TX pending: ${tx.hash.slice(0,10)}`);await tx.wait();alert("Withdraw all successful.");if(isAdmin) await setupDevTools();}catch(e){alert("Withdraw all failed: "+ (e.reason || e.data?.message || e.message));}finally{if(!(isAdmin && typeof setupDevTools === 'function' && typeof e === 'undefined')) hideLoading();}}},
        { label: "💸 Withdraw 50%", width: 140, action: async () => { if (globalIsLoading) return; if(!signer) return alert("No signer"); showLoading("Withdrawing 50%..."); try {const c=new ethers.Contract(window.__SLOT_ADDR__,["function withdrawHalf()"],signer); const tx=await c.withdrawHalf();showLoading(`TX pending: ${tx.hash.slice(0,10)}`);await tx.wait();alert("Withdraw 50% successful.");if(isAdmin) await setupDevTools();}catch(e){alert("Withdraw 50% failed: "+ (e.reason || e.data?.message || e.message));}finally{if(!(isAdmin && typeof setupDevTools === 'function' && typeof e === 'undefined')) hideLoading();}}}
    ];

    adminActions.forEach(item => {
        if (currentX + item.width > 780 - 10) { 
            currentX = (connectButton.x + connectButton.width + walletDisplayWidth + 10);
            currentY += buttonHeight + spacing; 
        }
        if (currentX + item.width > 780 -10 && currentX > (connectButton.x + connectButton.width + walletDisplayWidth + 10) ) {
             console.warn("Admin buttons might be too wide for the current layout.");
        }

        const btn = createButton(item.label).position(currentX, currentY).size(item.width, buttonHeight).style("font-size", "10px");
        btn.mousePressed(item.action);
        adminToolButtons.push(btn);
        currentX += item.width + spacing;
    });
    hideLoading();
}
// DApp용 wallet.js에서는 handleGrantSpinsBatch 함수는 필요 없음