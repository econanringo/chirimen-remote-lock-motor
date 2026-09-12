// センサーは常時動作し、モーター駆動だけをスマホからのロック状態でゲートする
import { requestGPIOAccess } from "node-web-gpio";
import { RelayServer } from "./RelayServer.js";

const CHANNEL_NAME = "chirimenLockMotor"; // チャンネル名はここ
const SWITCH_PORT = 5;
const MOTOR_PORT = 26; // 物理ピン37
const MOTOR_RUN_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let isUnlocked = false;
let isMotorBusy = false;
let channel;
let motorPort;

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

async function setMotor(on) {
  await motorPort.write(on ? 1 : 0);
  const state = on ? "ON" : "OFF";
  console.log(`モーター: ${state}`);
  sendMessage({ type: "motor", state });
}

// センサー処理とモーター駆動の間のゲート
async function onSensorTriggered() {
  if (!isUnlocked) {
    console.log("ロック中のためモーターを動かさない");
    sendMessage({ type: "motor", state: "BLOCKED" });
    return;
  }
  if (isMotorBusy) return;

  isMotorBusy = true;
  try {
    await setMotor(true);
    await sleep(MOTOR_RUN_MS);
    await setMotor(false);
  } finally {
    isMotorBusy = false;
  }
}

async function applyMotorCommand(data) {
  switch (data.command) {
    case "ON":
      await setMotor(true);
      break;
    case "OFF":
      await setMotor(false);
      break;
    case "RUN":
      if (isMotorBusy) return;
      isMotorBusy = true;
      try {
        await setMotor(true);
        await sleep(MOTOR_RUN_MS);
        await setMotor(false);
      } finally {
        isMotorBusy = false;
      }
      break;
    default:
      break;
  }
}

function applyLockCommand(data) {
  if (data.state !== "UNLOCK" && data.state !== "LOCK") return;
  isUnlocked = data.state === "UNLOCK";
  console.log(`ロック状態: ${lockStateLabel()}`);
  sendLockState();
}

async function handleMessage({ data }) {
  if (!data || typeof data !== "object") return;

  switch (data.type) {
    case "lock":
      applyLockCommand(data);
      break;
    case "motor":
      await applyMotorCommand(data);
      break;
    case "sync":
      sendLockState();
      break;
    default:
      break;
  }
}

// --- GPIOの準備 ---
const gpioAccess = await requestGPIOAccess();

const motor = gpioAccess.ports.get(MOTOR_PORT);
await motor.export("out");
await motor.write(0);
motorPort = motor;

// 同僚のセンサー実装へ差し替える場合は、このブロックを置き換える
const switchPort = gpioAccess.ports.get(SWITCH_PORT);
await switchPort.export("in");

// --- WebSocketリレーの準備 ---
const relay = RelayServer("chirimentest", "chirimenSocket");
channel = await relay.subscribe(CHANNEL_NAME);
console.log("web socketリレーサービスに接続しました");
channel.onmessage = handleMessage;
sendLockState();

// リレー接続後に付けないと、初回ポート読み取りで channel が未定義のまま落ちる
switchPort.onchange = async (ev) => {
  const pressed = ev.value === 0; // プルアップ想定: 押すと Low(0)
  const sensorState = pressed ? "ON" : "OFF";
  console.log(`センサー: ${sensorState}`);
  sendMessage({ type: "sensor", state: sensorState });
  if (pressed) {
    await onSensorTriggered();
  }
};
