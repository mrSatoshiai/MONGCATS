// main.js – UI 상태 관리 강화 및 문제점 수정
// (낙관적 업데이트 제외, 구조적 개선 적용)

// 전역 변수 선언 (애플리케이션 전체에서 공유)
let connectButton, walletDisplay; // p5.Element 객체들
let walletAddress = "";          // 현재 연결된 지갑 주소
let provider, signer;          // Ethers provider 및 signer 객체 (wallet.js에서 할당)
let isConnected = false;         // 지갑 연결 상태 (wallet.js에서 관리)
//let isAdmin = false;             // 관리자 여부 (wallet.js에서 관리)


let bgImage; // 배경 이미지 p5.Image 객체

let slotImages = []; // 슬롯 이미지 p5.Image 객체 배열
const totalImages = 9; // 총 슬롯 이미지 개수 (utils.js 등에서도 참조 가능)
let reels = [];      // 각 릴의 상태를 담는 객체 배열
const reelHeight = 150, reelWidth = 150; // 릴 크기 상수

let spinning = false, result = ''; // 게임 진행 상태 변수
let score = 0, playCredits = 0; // 현재 점수 및 남은 스핀 수
let gameStarted = false;         // 게임 화면 표시 여부 상태

let spinButton, resetButton, claimButton, insertButtons = []; // UI 버튼 p5.Element 객체들
let scoreBreakdown = []; // 점수 상세 내역 (evaluateResult에서 채워짐)

// 토큰 정보 표시용 UI 요소 (p5.Element)
let tokenInfoBox;
let tmongBalanceDiv;
let tmongInfoDiv;
let addTMongTokenLink;

// <<< playerSession 전역 변수 선언 및 초기화 >>>
let playerSession = {
    wallet: "",
    seeds: [],
    paidSeeds: [],
    totalScore: 0
};

// 버튼 크기 및 위치 관련 상수
const BACK_W  = 160;
const CLAIM_W = 140;
const GAP_W   = 20;
const BTN_Y   = 480;

// ===== 로딩 상태 관련 전역 변수 및 함수 =====
let globalIsLoading = false;
let globalLoadingMessage = '';

function showLoading(message) {
    console.log(`[Loading] Show: ${message}`);
    globalIsLoading = true;
    globalLoadingMessage = message;

    const elementsToDisable = [
        connectButton, ...insertButtons, spinButton, resetButton, claimButton,
        ...(typeof adminToolComponents !== 'undefined' ? Object.values(adminToolComponents) : []),
        ...(typeof adminToolButtons !== 'undefined' ? adminToolButtons : [])
    ];

    elementsToDisable.forEach(el => {
        if (el && el.elt && typeof el.attribute === 'function') {
            el.attribute('disabled', 'true');
        }
    });
}

function hideLoading() {
    console.log("[Loading] Hide. Current state: isConnected=", isConnected, "gameStarted=", gameStarted, "claimMode=", claimMode(), "playCredits=", playCredits, "spinning=", spinning, "isAdmin=", isAdmin);
    globalIsLoading = false;
    globalLoadingMessage = '';

    if (connectButton && connectButton.elt) {
        connectButton.removeAttribute('disabled');
    }

    const showInsertButtonsUI = isConnected && !gameStarted && !claimMode();
    insertButtons.forEach(btn => {
        if (btn && btn.elt) {
            if (showInsertButtonsUI) {
                btn.show(); btn.removeAttribute('disabled');
            } else {
                btn.hide(); btn.attribute('disabled', 'true');
            }
        }
    });

    const showSpinButtonUI = isConnected && gameStarted && playCredits > 0 && !spinning && !claimMode();
    if (spinButton && spinButton.elt) {
        if (showSpinButtonUI) {
            spinButton.show(); spinButton.removeAttribute('disabled');
            console.log("Spin button VISIBLE AND ENABLED");
        } else {
            spinButton.hide(); spinButton.attribute('disabled', 'true');
            console.log("Spin button HIDDEN OR DISABLED");
        }
    }

    const showResetButtonUI = isConnected && gameStarted && playCredits <= 0 && !spinning && !claimMode();
    if (resetButton && resetButton.elt) {
        if (showResetButtonUI) {
            resetButton.show(); resetButton.removeAttribute('disabled');
        } else {
            resetButton.hide(); resetButton.attribute('disabled', 'true');
        }
    }
    const showClaimButtonUI = isConnected && claimMode();
    if (claimButton && claimButton.elt) {
        if (showClaimButtonUI) {
            claimButton.show(); claimButton.removeAttribute('disabled');
        } else {
            claimButton.hide(); claimButton.attribute('disabled', 'true');
        }
    }

    const adminElements = [
        ...(typeof adminToolComponents !== 'undefined' ? Object.values(adminToolComponents) : []),
        ...(typeof adminToolButtons !== 'undefined' ? adminToolButtons : [])
    ];
    adminElements.forEach(el => {
        if (el && el.elt && typeof el.removeAttribute === 'function') {
            if (typeof isAdmin !== 'undefined' && isAdmin) {
                 el.removeAttribute('disabled');
                 if (typeof el.show === 'function' && el !== connectButton) el.show();
            } else {
                 el.attribute('disabled', 'true');
                 if (typeof el.hide === 'function' && el !== connectButton ) {
                    el.hide();
                 }
            }
        }
    });
}
// ===== 로딩 상태 관련 전역 변수 및 함수 끝 =====

function preload() {
    for (let i = 1; i <= totalImages; i++) {
        let imagePath = `img/${i}.jpg`;
        slotImages.push(loadImage(imagePath));
    }
    bgImage = loadImage('./bg.jpg');
}

function setup() {
    let cnv = createCanvas(780, 530);
    try {
        if (drawingContext?.canvas) drawingContext.canvas.willReadFrequently = true;
    } catch (e) { console.warn("[Setup] Error setting willReadFrequently:", e); }

    textAlign(CENTER, CENTER);

    connectButton = createButton("🦊 Connect Wallet")
        .position(20, 20)
        .mousePressed(async () => {
            if (globalIsLoading) return;
            if (typeof connectWallet === 'function') await connectWallet(); // wallet.js
            else { console.error("connectWallet function is not defined."); alert("Wallet connection unavailable."); }
        });

    walletDisplay = createDiv("")
        .style("font-size", "12px")
        .style("font-family", "monospace")
        .style("line-height", "1.5")
        .style("text-align", "left")
        .style("padding-left", "5px")
        .style("width", "150px") // 너비 지정
        .position(connectButton.x, connectButton.y + connectButton.height + 5);

    if (typeof setupInsertButtons === 'function') setupInsertButtons(); // ui.js
    else console.error("setupInsertButtons function is not defined.");

    setupButtons();
    positionBottomButtons();

    if (typeof createReel === 'function') { // utils.js
        for (let i = 0; i < 3; i++) reels.push(createReel());
    } else console.error("createReel function is not defined.");

    const tokenInfoBoxWidth = 380;
    const tokenInfoBoxHeight = 80;
    const tokenInfoBoxY = BTN_Y - tokenInfoBoxHeight - 25;

    tokenInfoBox = createDiv('')
        .position(width / 2 - tokenInfoBoxWidth / 2, tokenInfoBoxY)
        .size(tokenInfoBoxWidth, tokenInfoBoxHeight)
        .style('background-color', 'rgba(255, 255, 255, 0.85)')
        .style('border', '1px solid black')
        .style('border-radius', '10px')
        .style('padding', '10px')
        .style('box-sizing', 'border-box')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('align-items', 'center')
        .style('justify-content', 'space-around')
        .style('text-align', 'center')
        .hide();

    tmongBalanceDiv = createDiv('').style('font-size', '14px').style('color', 'black').parent(tokenInfoBox);
    tmongInfoDiv = createDiv('').style('font-size', '10px').style('color', '#333').style('word-break', 'break-all').parent(tokenInfoBox);

    addTMongTokenLink = createA('javascript:void(0);', 'Add tMONG to MetaMask')
        .style('font-size', '10px')
        .style('color', '#007bff')
        .style('text-decoration', 'underline')
        .style('cursor', 'pointer')
        .parent(tokenInfoBox)
        .mousePressed(() => {
            if (globalIsLoading) return;
            if (typeof window.addTMongToMetamask === 'function') window.addTMongToMetamask(); // wallet.js
            else { console.error("addTMongToMetamask function not defined."); alert("MetaMask integration unavailable."); }
        });
    hideLoading(); // 초기 로딩 완료 후 버튼 상태 정상화
}

function updateTokenInfoUI(balance, tokenCa) {
    if (tokenInfoBox) {
        if (tmongBalanceDiv) tmongBalanceDiv.html(`My Balance: ${balance !== null ? balance : 'Loading...'}`);
        if (tmongInfoDiv) tmongInfoDiv.html(`$tMONG CA: ${tokenCa || 'N/A'}`);
        // 토큰 박스 표시는 draw() 함수에서 제어
    }
}

function hideTokenInfoUI() {
    if (tokenInfoBox?.hide) tokenInfoBox.hide();
}

async function fetchAndUpdateTokenInfo() {
    if (!isConnected || !walletAddress || !window.__TMONG_ADDR__) {
        hideTokenInfoUI(); return;
    }
    try {
        if (typeof getTMongBalance === 'function') { // wallet.js
            const balance = await getTMongBalance(walletAddress);
            updateTokenInfoUI(balance, window.__TMONG_ADDR__);
        } else {
            console.error("getTMongBalance function not defined.");
            updateTokenInfoUI("Error", window.__TMONG_ADDR__);
        }
    } catch (error) {
        console.error("Error in fetchAndUpdateTokenInfo:", error);
        updateTokenInfoUI("Error fetching", window.__TMONG_ADDR__);
    }
}

function draw() {
    if (bgImage?.width > 0 && bgImage?.height > 0) {
        push(); tint(255, 77); image(bgImage, 0, 0, width, height); pop();
    } else background(240);

    // UI 상태에 따른 화면 렌더링
    if (!isConnected) {
        fill(0); textSize(20); textAlign(CENTER, CENTER);
        text("🦊 Please connect your wallet to play.", width / 2, height / 2 - 50);
        hideTokenInfoUI();
        // 버튼 표시는 hideLoading()이 전담
    } else if (claimMode()) {
        layoutClaimMode(); // Claim 버튼 관련 UI 조정
        hideTokenInfoUI();
        if (typeof drawGameScreen === 'function') drawGameScreen();
        if (typeof drawResultText === 'function') drawResultText();
        if (typeof drawScoreBreakdown === 'function') drawScoreBreakdown();
    } else if (!gameStarted) { // 코인 투입 화면
        if (typeof drawInsertCoinScreen === 'function') drawInsertCoinScreen();
        if (tokenInfoBox) tokenInfoBox.show();
    } else { // 게임 진행 중
        hideTokenInfoUI();
        if (typeof drawGameScreen === 'function') drawGameScreen();
        if (typeof updateReelAnimations === 'function' && spinning) {
            updateReelAnimations();
        }
        if (!spinning && result) {
            if (typeof drawResultText === 'function') drawResultText();
            if (typeof drawScoreBreakdown === 'function') drawScoreBreakdown();
        }
    }

    if (spinning && reels.every(r => r.spinSpeeds && r.spinSpeeds.length === 0)) {
        spinning = false;
        if (typeof evaluateResult === 'function') evaluateResult(); // game.js
        else console.error("evaluateResult function not defined.");
        if (!globalIsLoading) hideLoading(); // 스핀 종료 후 버튼 상태 갱신
    }

    if (globalIsLoading) {
        push();
        fill(10, 10, 10, 200); rect(0, 0, width, height);
        fill(255); textSize(22); textAlign(CENTER, CENTER);
        text(globalLoadingMessage, width / 2, height / 2);
        translate(width / 2, height / 2 + 50); stroke(255); strokeWeight(3); noFill();
        let arcEnd = map(sin(frameCount * 0.1), -1, 1, HALF_PI, TWO_PI - QUARTER_PI);
        arc(0, 0, 30, 30, 0, arcEnd);
        pop();
    }
}

const claimMode = () =>
    typeof hasRemainingSeeds === 'function' && !hasRemainingSeeds() && playCredits === 0 && score > 0; // session.js

function setupButtons() {
    spinButton = createButton('SPIN')
        .size(80, 40)
        .mousePressed(async () => {
            if (globalIsLoading) return;
            if (!isConnected) return alert("🦊 Please connect your wallet first.");
            if (playCredits <= 0) { alert("🎰 Please insert coins! (No credits to spin)"); return; }
            if (spinning) return;
            if (typeof startSpin !== 'function') { console.error("startSpin function not defined."); return; }
            await startSpin(); // game.js (spinning = true 설정)
            if (!globalIsLoading) hideLoading(); // 스핀 시작 후 즉시 버튼 상태 업데이트
        })
        .hide();

    resetButton = createButton('← Back to Insert Coin')
        .size(BACK_W, 40)
        .mousePressed(() => {
            if (globalIsLoading) return;
            restoreDefaultLayout();
        })
        .hide();

    claimButton = createButton('💰 Claim $tMONG')
        .size(CLAIM_W, 40)
        .mousePressed(async () => {
            if (globalIsLoading) return;
            if (typeof claimTokens !== 'function') { console.error("claimTokens function not defined."); return; }
            await claimTokens(); // claim.js (내부에서 로딩 관리 및 restoreDefaultLayout 호출)
        })
        .hide();
}

function positionBottomButtons() {
    if (resetButton) resetButton.position(width / 2 - resetButton.width / 2, BTN_Y);
    if (spinButton) spinButton.position(width / 2 - spinButton.width / 2, BTN_Y);
    if (claimButton) claimButton.position(width / 2 - claimButton.width / 2, BTN_Y);
}

function layoutClaimMode() {
    // hideLoading()에서 claimButton 표시/활성화 관리
    if (claimButton) {
         claimButton.position(width / 2 - claimButton.width / 2, BTN_Y);
    }
}

function restoreDefaultLayout() {
    console.log("[restoreDefaultLayout] Called. Resetting to insert coin screen state.");
    gameStarted = false;
    result = '';
    spinning = false;

    if (typeof fetchAndUpdateTokenInfo === 'function' && isConnected) {
         fetchAndUpdateTokenInfo();
    }
    // 이 함수가 호출되면 UI는 "코인 투입" 상태로 돌아가야 함.
    // hideLoading()을 호출하여 이 상태에 맞는 버튼들을 최종적으로 설정.
    if (typeof hideLoading === 'function' && !globalIsLoading) { // 다른 로딩 작업이 진행 중이 아닐 때만 UI 정리
      hideLoading();
    }
}