// wallet.js – DApp 내 관리자 UI는 기본 3개 버튼만 표시하도록 수정

let isAdmin = false;
let expectedChainId = null;
let adminChecked = false;

// adminToolComponents는 DApp 내에서는 더 이상 사용하지 않음 (또는 최소한으로 사용)
// let adminToolComponents = {};
// adminToolButtons는 p5.Element 버튼들만 저장 (Clear Session, Withdraw 등)
let adminToolButtons = [];

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
    try {
        const response = await fetch("./deploy.json");
        if (!response.ok) throw new Error("Failed to fetch deploy.json. Status: " + response.status);
        const info = await response.json();
        if (!info.chainId || !info.SlotMachine || !info.tMONG) throw new Error("deploy.json is missing key data.");
        expectedChainId = Number(info.chainId);
        window.__SLOT_ADDR__ = info.SlotMachine;
        window.__TMONG_ADDR__ = info.tMONG;
        console.log("[DeployInfo] Loaded successfully.");
        return true;
    } catch (e) {
        console.error("❌ deploy.json load failed:", e);
        expectedChainId = null;
        window.__SLOT_ADDR__ = undefined;
        window.__TMONG_ADDR__ = undefined;
        return false;
    }
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
            try {
                finalDecimals = Number(await tmongContract.decimals());
                tMONGDecimals = finalDecimals;
            } catch(e) { console.warn("Failed to fetch decimals on fallback."); }
        }
        if (tMONGSymbol === null && typeof tmongContract.symbol === 'function') {
            try {
                finalSymbol = await tmongContract.symbol();
                tMONGSymbol = finalSymbol;
            } catch(e) { console.warn("Failed to fetch symbol on fallback."); }
        }
        const formattedBalance = ethers.utils.formatUnits(balanceBigNumber, finalDecimals);
        return `${formattedBalance} ${finalSymbol}`;
    } catch (error) {
        console.error("Error fetching tMONG balance:", error);
        if (error.code === -32603 || error.message?.includes("429")) {
            return "Balance update delayed (RPC limit).";
        }
        return "Error";
    }
}

async function addTMongToMetamask() {
    if (!window.ethereum) return alert("MetaMask is not installed or not active.");
    if (!window.__TMONG_ADDR__) return alert("tMONG token contract address unknown. Please check deploy.json.");

    showLoading("Adding $tMONG to MetaMask...");
    let tokenSymbol = tMONGSymbol || '$tMONG';
    let tokenDecimals = tMONGDecimals !== null ? tMONGDecimals : 18;

    try {
        if (provider && (tMONGSymbol === null || tMONGDecimals === null)) {
            const tmongContractForInfo = new ethers.Contract(window.__TMONG_ADDR__, TMONG_MINIMAL_ABI, provider);
            if (tMONGSymbol === null) tokenSymbol = await tmongContractForInfo.symbol();
            if (tMONGDecimals === null) tokenDecimals = Number(await tmongContractForInfo.decimals());
            if (tMONGSymbol === null && tokenSymbol) tMONGSymbol = tokenSymbol;
            if (tMONGDecimals === null && tokenDecimals) tMONGDecimals = tokenDecimals;
        } else if (!provider) {
            console.warn("addTMongToMetamask: Provider not available for metadata fetch, using defaults/cache.");
        }

        const wasAdded = await window.ethereum.request({
            method: 'wallet_watchAsset',
            params: { type: 'ERC20', options: { address: window.__TMONG_ADDR__, symbol: tokenSymbol, decimals: tokenDecimals }},
        });
        alert(wasAdded ? `${tokenSymbol} token added successfully!` : `${tokenSymbol} token addition was not completed.`);
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
    if (!window.ethereum) return null;
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
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

    // adminToolComponents와 adminToolButtons는 DApp 내 관리자 UI용
    if (typeof adminToolComponents !== 'undefined' && adminToolComponents.grantTitle && typeof adminToolComponents.grantTitle.remove === 'function') {
        Object.values(adminToolComponents).forEach(comp => comp.remove());
    }
    adminToolComponents = {};
    adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
    adminToolButtons = [];

    if (playerSession?.wallet) localStorage.removeItem(`slot_session_${playerSession.wallet}`);
    playerSession = { wallet: "", seeds: [], paidSeeds: [], totalScore: 0 };

    gameStarted = false; score = 0; playCredits = 0; result = ''; spinning = false;
    if (typeof reels !== 'undefined') reels.length = 0;
    if (typeof scoreBreakdown !== 'undefined') scoreBreakdown.length = 0;

    if (typeof hideTokenInfoUI === 'function') hideTokenInfoUI();

    if (window.ethereum?.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleMetaMaskChainChanged);
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

async function connectWallet() {
  console.log("---[CONNECT WALLET START]---");
  showLoading("Connecting wallet...");

  try {
      if (!await loadDeployInfo()) throw new Error("Failed to load DApp configuration. Please refresh.");
      if (isConnected) { disconnectAndReset("User disconnected."); return; }

      showLoading("Connecting to MetaMask...");
      const mm = getMetamaskProvider();
      if (!mm) { throw new Error("🦊 MetaMask is required to play."); }

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      walletAddress = await signer.getAddress();

      showLoading("Verifying network...");
      const net = await provider.getNetwork();
      if (net.chainId !== expectedChainId) {
          throw new Error(`Please switch to the correct network (Required: ${expectedChainId}, Current: ${net.chainId})`);
      }

      showLoading("Requesting signature...");
      await signer.signMessage("Sign to use Monad SlotMachine and verify ownership.");

      isConnected = true;
      if (walletDisplay) walletDisplay.html(`${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`);
      if (connectButton) connectButton.html("🔓 Disconnect");

      if (window.ethereum?.on) {
          window.ethereum.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleMetaMaskChainChanged);
          window.ethereum.on('accountsChanged', handleMetaMaskAccountsChanged);
          window.ethereum.on('chainChanged', handleMetaMaskChainChanged);
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
          await setupDevTools(); // setupDevTools는 내부적으로 showLoading/hideLoading 관리
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
      adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); }); adminToolButtons = [];
      if (typeof hideTokenInfoUI === 'function') hideTokenInfoUI();
      if (window.ethereum?.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleMetaMaskChainChanged);
      }
      if(typeof hideLoading === 'function') hideLoading();
      console.log("---[CONNECT WALLET ERROR END]---");
  }
}


function getMetamaskProvider() {
    if (window.ethereum?.providers?.length) {
        return window.ethereum.providers.find(p => p.isMetaMask) || window.ethereum;
    }
    if (window.ethereum?.isMetaMask || window.ethereum) {
        return window.ethereum;
    }
    return null;
}

function handleMetaMaskChainChanged(chainId) {
    const newChainId = Number(chainId);
    console.log(`[MainApp] MetaMask network changed to Chain ID: ${newChainId}. Verifying...`);
    if (typeof showLoading === 'function' && (typeof globalIsLoading === 'undefined' || !globalIsLoading) ) {
        showLoading("Network change detected. Verifying...");
    } else if (typeof showLoading === 'function') {
        showLoading("Network change detected. Verifying...");
    }

    if (newChainId !== expectedChainId) {
        disconnectAndReset(`Network changed. Please connect to the correct network (Chain ID: ${expectedChainId}).`);
    } else if (isConnected) { 
        console.log("[MainApp] Network changed back to expected chain. Current session maintained.");
        if(typeof hideLoading === 'function') hideLoading();
    } else { 
        if(typeof hideLoading === 'function') hideLoading();
    }
}

async function setupDevTools() { // DApp 내 관리자 UI (기본 3개 버튼)
  if (!isAdmin) { // 관리자가 아니면 아무것도 생성하지 않음
      adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
      adminToolButtons = [];
      return;
  }
  showLoading("Setting up Admin Tools..."); // main.js의 함수 사용
  
  adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
  adminToolButtons = [];
  // DApp에서는 adminToolComponents 객체를 사용하지 않으므로 관련 초기화 제거


  // 버튼 위치 계산
  let currentX = 20; // 기본 X 위치
  const buttonY = 20; // Connect 버튼과 같은 Y 선상에 위치
  const buttonHeight = 25;
  const spacing = 8; // 버튼 간 간격

  // 1. Connect 버튼 너비 가져오기
  let connectButtonWidth = 0;
  if (connectButton && connectButton.elt) { // connectButton은 main.js의 전역 변수
      try {
          connectButtonWidth = connectButton.width; // p5.js element의 너비
      } catch(e) {
          console.warn("Could not get connectButton width, using default 120.", e);
          connectButtonWidth = 120; // 기본 추정치
      }
      currentX = connectButton.x  + spacing;
  }


  // 2. WalletDisplay 너비 가져오기 (존재한다면)
  if (walletDisplay && walletDisplay.elt) { // walletDisplay는 main.js의 전역 변수
      try {
          // walletDisplay는 p5.js div이므로 elt.offsetWidth 사용 시도
          // 또는 main.js에서 설정한 너비 값을 참조할 수 있다면 더 좋음 (예: walletDisplay.width() )
          let displayWidth = walletDisplay.elt.offsetWidth || parseInt(walletDisplay.style('width')) || 150; // 스타일에서 너비 가져오기 시도
          currentX += displayWidth + spacing;
      } catch(e) {
          console.warn("Could not get walletDisplay width, adding default spacing.", e);
          currentX += 150 + spacing; // walletDisplay 추정 너비 + 간격
      }
  }


  let contractBalanceEth = null;
  try { contractBalanceEth = await getSlotMachineContractBalance(); } catch(e) { console.error(e); }
  
  const adminActions = [
      { label: "🧹 Clear Session", width: 120, action: () => { if (globalIsLoading) return; showLoading("Clearing session..."); localStorage.removeItem(`slot_session_${walletAddress}`); alert("Session cleared. Reloading..."); location.reload(); }},
      { label: `💸 Withdraw All ${contractBalanceEth ? `(${parseFloat(contractBalanceEth).toFixed(2)} MON)` : ''}`, width: 210, action: async () => { if (globalIsLoading) return; if(!signer) return alert("No signer"); showLoading("Withdrawing all..."); try {const c=new ethers.Contract(window.__SLOT_ADDR__,["function withdrawAll()"],signer); const tx=await c.withdrawAll();showLoading(`TX pending: ${tx.hash.slice(0,10)}`);await tx.wait();alert("Withdraw all successful.");if(isAdmin) await setupDevTools();}catch(e){alert("Withdraw all failed: "+ (e.reason || e.data?.message || e.message));}finally{if(!(isAdmin && typeof setupDevTools === 'function' && typeof e === 'undefined')) hideLoading();}}},
      { label: "💸 Withdraw 50%", width: 140, action: async () => { if (globalIsLoading) return; if(!signer) return alert("No signer"); showLoading("Withdrawing 50%..."); try {const c=new ethers.Contract(window.__SLOT_ADDR__,["function withdrawHalf()"],signer); const tx=await c.withdrawHalf();showLoading(`TX pending: ${tx.hash.slice(0,10)}`);await tx.wait();alert("Withdraw 50% successful.");if(isAdmin) await setupDevTools();}catch(e){alert("Withdraw 50% failed: "+ (e.reason || e.data?.message || e.message));}finally{if(!(isAdmin && typeof setupDevTools === 'function' && typeof e === 'undefined')) hideLoading();}}}
  ];

  // 버튼을 한 줄에 배치하기 위한 로직
  adminActions.forEach(item => {
      // 화면 너비(780px 가정)를 초과하는지 확인
      if (currentX + item.width > 780 - 10) { // 우측 여백 10px 고려
          // 다음 줄로 넘기지 않고, 공간이 부족하면 더 이상 그리지 않거나,
          // 버튼 너비를 동적으로 줄이는 등의 처리가 필요할 수 있음.
          // 여기서는 일단 공간이 부족하면 버튼이 잘릴 수 있음을 인지.
          // 또는, 버튼들의 전체 너비를 계산해서 시작 X를 조절할 수도 있음.
          console.warn(`Admin button "${item.label}" might overflow or wrap if not enough horizontal space.`);
      }
      
      const btn = createButton(item.label).position(currentX, buttonY).size(item.width, buttonHeight).style("font-size", "10px"); // 폰트 크기 미세 조정
      btn.mousePressed(item.action);
      adminToolButtons.push(btn);
      currentX += item.width + spacing;
  });

  hideLoading(); // 관리자 도구 설정 완료 후 로딩 해제
}

// handleGrantSpinsBatch 함수는 DApp용 wallet.js에서는 필요 없음.
// async function handleGrantSpinsBatch() { ... }