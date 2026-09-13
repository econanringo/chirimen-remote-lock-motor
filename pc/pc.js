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
  messageDiv.textContent = text;
}

function renderLock(state) {
  const unlocked = state === "UNLOCK";
  lockState.textContent = state;
  lockState.classList.toggle("lock-off", unlocked);
  lockState.classList.toggle("lock-on", !unlocked);
}

function renderSensor(state) {
  sensorState.textContent = state;
}

function renderLux(value) {
  luxState.textContent = `${value} lx`;
}

function renderServo(data) {
  servoState.textContent = data.state;
  if (data.state === "BLOCKED") {
    setMessage("ロック中のためサーボは動きませんでした");
    return;
  }
  if (data.state === "MOVED") {
    const kind = data.kind === "ON" ? "起動(ON)" : "停止(OFF)";
    setMessage(`サーボを動かしました（${kind}）`);
  }
}

const relay = RelayServer("chirimentest", "chirimenSocket");
const channel = await relay.subscribe(CHANNEL_NAME);

connectionStatus.textContent = "接続済み";
connectionStatus.classList.remove("status-wait");
connectionStatus.classList.add("status-ok");
setMessage("web socketリレーサービスに接続しました");
channel.send({ type: "sync" });

channel.onmessage = ({ data }) => {
  if (!data || typeof data !== "object") return;

  if (data.type === "lock") {
    renderLock(data.state);
    setMessage(`ロック状態を ${data.state} にしました`);
    return;
  }
  if (data.type === "sensor") {
    renderSensor(data.state);
    setMessage(`センサーが ${data.state} になりました`);
    return;
  }
  if (data.type === "lux" && typeof data.value === "number") {
    renderLux(data.value);
    return;
  }
  if (data.type === "servo" && data.state) {
    renderServo(data);
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
