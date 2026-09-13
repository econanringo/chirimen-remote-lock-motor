import { requestI2CAccess } from "node-web-i2c";
import { requestGPIOAccess } from "node-web-gpio";
import BH1750 from "@chirimen/bh1750";
import PCA9685 from "@chirimen/pca9685";
import { RelayServer } from "./RelayServer.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- 設定 ----
const CHANNEL_NAME = "chirimenLockMotor"; // チャンネル名はここ
const LUX_THRESHOLD = 10;    // この値以上で照度トリガー
const HIGH_HOLD_MS = 5000;   // 10以上がこの時間続いたら照度トリガー成立
const REST_ANGLE = 30;       // 通常（待機）位置
const ACTION_ANGLE = -15;    // 動作位置（機器のボタンを押す）
const HOLD_MS = 1000;        // 動作位置での保持時間
const READ_INTERVAL = 500;   // 照度を読む間隔(ms)

// ---- I2C 初期化（BH1750 + PCA9685）----
const i2cAccess = await requestI2CAccess();
const i2cPort = i2cAccess.ports.get(1);

const bh1750 = new BH1750(i2cPort, 0x23);
await bh1750.init();

const pca9685 = new PCA9685(i2cPort, 0x40);
await pca9685.init(0.001, 0.002, 30);
await pca9685.setServo(0, REST_ANGLE);

// ---- GPIO 初期化（ボタン=GPIO5入力, 出力=GPIO26）----
const gpioAccess = await requestGPIOAccess();
const button = gpioAccess.ports.get(5);
await button.export("in");
const output = gpioAccess.ports.get(26);
await output.export("out");
await output.write(0);

// ---- 状態 ----
let count = 0;         // サーボを動かした回数（奇数=起動ON, 偶数=停止OFF）
let busy = false;      // サーボ動作中の多重起動防止
let highSince = null;  // 10以上が続き始めた時刻(ms)。条件を満たさない間は null
let isUnlocked = false;
let channel;

function lockStateLabel() {
  return isUnlocked ? "UNLOCK" : "LOCK";
}

function sendMessage(payload) {
  if (!channel) return;
  channel.send(payload);
}

function sendLockState() {
  sendMessage({ type: "lock", state: lockStateLabel() });
}

function kindLabel() {
  return count % 2 === 1 ? "ON" : "OFF";
}

// サーボを1回動かす（機器のボタンを押す動作）
async function activate(source) {
  const gated = source === "ボタン" || source === "照度";
  if (gated && !isUnlocked) {
    console.log("ロック中のためサーボを動かさない");
    sendMessage({ type: "servo", state: "BLOCKED" });
    return;
  }
  if (busy) return;
  busy = true;
  try {
    count++;
    const kind = count % 2 === 1 ? "起動(ON)" : "停止(OFF)";
    console.log(source + ": " + count + "回目 -> " + kind);
    await pca9685.setServo(0, ACTION_ANGLE);
    await sleep(HOLD_MS);
    await pca9685.setServo(0, REST_ANGLE);
    sendMessage({ type: "servo", state: "MOVED", count, kind: kindLabel() });
  } finally {
    busy = false;
  }
}

function applyLockCommand(data) {
  if (data.state !== "UNLOCK" && data.state !== "LOCK") return;
  isUnlocked = data.state === "UNLOCK";
  if (!isUnlocked) highSince = null;
  console.log(`ロック状態: ${lockStateLabel()}`);
  sendLockState();
}

async function applyServoCommand(data) {
  if (data.command !== "RUN") return;
  await activate("リモート");
}

async function handleMessage({ data }) {
  if (!data || typeof data !== "object") return;

  switch (data.type) {
    case "lock":
      applyLockCommand(data);
      break;
    case "servo":
      await applyServoCommand(data);
      break;
    case "sync":
      sendLockState();
      break;
    default:
      break;
  }
}

// --- WebSocketリレーの準備 ---
const relay = RelayServer("chirimentest", "chirimenSocket");
channel = await relay.subscribe(CHANNEL_NAME);
console.log("web socketリレーサービスに接続しました");
channel.onmessage = handleMessage;
sendLockState();

// リレー接続後に付けないと、初回ポート読み取りで channel が未定義のまま落ちる
button.onchange = async (e) => {
  const pressed = e.value == 0; // プルアップ想定: 押すと Low(0)
  const sensorState = pressed ? "ON" : "OFF";
  console.log(`センサー: ${sensorState}`);
  sendMessage({ type: "sensor", state: sensorState });

  if (pressed) {
    await output.write(1);
    await activate("ボタン");
    highSince = null;          // 状態が変わったので照度タイマーもリセット
  } else {
    await output.write(0);
  }
};

// ---- 照度計ループ ----
while (true) {
  const lux = await bh1750.measure_high_res();
  console.log(lux.toFixed(3) + "lx");
  sendMessage({ type: "lux", value: Number(lux.toFixed(3)) });

  // 照度が使えるのは UNLOCK かつ「次が奇数回目(=起動ON)」のときだけ
  const lightAllowed = isUnlocked && count % 2 === 0;
  const now = Date.now();

  if (lightAllowed && lux >= LUX_THRESHOLD) {
    // 10以上が続いている: 開始時刻を記録し、5秒経過で成立
    if (highSince === null) highSince = now;
    if (now - highSince >= HIGH_HOLD_MS) {
      highSince = null;
      await activate("照度");
    }
  } else {
    // LOCK中、使えない回（偶数回目待ち）、または 10未満: タイマーをリセット
    highSince = null;
  }

  await sleep(READ_INTERVAL);
}
