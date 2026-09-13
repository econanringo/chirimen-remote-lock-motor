import { RelayServer } from "https://www.chirimen.org/remote-connection/js/beta/RelayServer.js";

const CHANNEL_NAME = "chirimenLockMotor"; // チャンネル名はここ

const connectionStatus = document.getElementById("connectionStatus");
const lockState = document.getElementById("lockState");
const sensorState = document.getElementById("sensorState");
const luxState = document.getElementById("luxState");
const servoState = document.getElementById("servoState");
const messageDiv = document.getElementById("messageDiv");
const unlockButton = document.getElementById("unlockButton");
const lockButton = document.getElementById("lockButton");
const servoRunButton = document.getElementById("servoRunButton");

function setMessage(text) {
  if (messageDiv) messageDiv.textContent = text;
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function normalizeData(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object") return data;
  return null;
}

function renderLock(state) {
  if (!state) return;
  const unlocked = state === "UNLOCK";
  setText(lockState, state);
  lockState?.classList.toggle("lock-off", unlocked);
  lockState?.classList.toggle("lock-on", !unlocked);
}

function renderSensor(state) {
  if (!state) return;
  setText(sensorState, state);
}

function renderLux(value) {
  const lux = Number(value);
  if (Number.isNaN(lux)) return;
  setText(luxState, `${lux} lx`);
}

function servoLabel(data) {
  if (!data) return "-";
  if (data.state === "MOVING") return "動作中";
  if (data.state === "BLOCKED") return "BLOCKED";
  if (data.state === "ERROR") return "ERROR";
  if (data.state === "IDLE") return "待機";
  if (data.kind === "ON" || data.state === "ON") return "ON";
  if (data.kind === "OFF" || data.state === "OFF") return "OFF";
  return data.state || "-";
}

function renderServo(data, { announce = true } = {}) {
  setText(servoState, servoLabel(data));
  if (!announce) return;

  if (data.state === "BLOCKED") {
    setMessage("ロック中のためサーボは動きませんでした");
    return;
  }
  if (data.state === "MOVING") {
    setMessage("サーボを動かしています");
    return;
  }
  if (data.state === "ERROR") {
    setMessage("サーボの駆動に失敗しました");
    return;
  }
  if (data.state === "MOVED" || data.state === "ON" || data.state === "OFF") {
    const kind = data.kind === "ON" || data.state === "ON" ? "起動(ON)" : "停止(OFF)";
    setMessage(`サーボを動かしました（${kind}）`);
  }
}

function applyStatus(data) {
  renderLock(data.lock);
  renderSensor(data.sensor);
  if (data.lux != null) renderLux(data.lux);
  if (data.servo) renderServo(data.servo, { announce: false });
}

const relay = RelayServer("chirimentest", "chirimenSocket");
const channel = await relay.subscribe(CHANNEL_NAME);

connectionStatus.textContent = "接続済み";
connectionStatus.classList.remove("status-wait");
connectionStatus.classList.add("status-ok");
setMessage("web socketリレーサービスに接続しました");
channel.send({ type: "sync" });

channel.onmessage = ({ data }) => {
  try {
    const payload = normalizeData(data);
    if (!payload) return;

    if (payload.type === "status") {
      applyStatus(payload);
      setMessage("デバイス状態を更新しました");
      return;
    }
    if (payload.type === "lock") {
      renderLock(payload.state);
      setMessage(`ロック状態を ${payload.state} にしました`);
      return;
    }
    if (payload.type === "sensor") {
      renderSensor(payload.state);
      return;
    }
    if (payload.type === "lux") {
      renderLux(payload.value);
      return;
    }
    if (payload.type === "servo" && (payload.state || payload.kind)) {
      renderServo(payload);
    }
  } catch (error) {
    console.error(error);
  }
};

function sendLock(state) {
  channel.send({ type: "lock", state });
  renderLock(state);
  setMessage(`${state} を送信しました`);
}

function sendServoRun() {
  channel.send({ type: "servo", command: "RUN" });
  setMessage("サーボを動かすを送信しました");
}

unlockButton.addEventListener("click", () => sendLock("UNLOCK"));
lockButton.addEventListener("click", () => sendLock("LOCK"));
servoRunButton.addEventListener("click", sendServoRun);
